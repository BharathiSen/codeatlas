"""Retrieval service: Qdrant-backed indexing and hybrid search.

The service is a single class with a narrow surface — `index_repository`,
`search`, `status` — so the answering side never learns that Qdrant exists.
Swapping the vector store means reimplementing this file and nothing else.

Retrieval is hybrid. Dense vectors find code that *means* the right thing;
keyword matching finds code that *says* it. Identifier lookup is exact-match
heavy — searching `validateSession` should return the function called
`validateSession`, which dense-only retrieval is unreliable at. The two rankings
are fused with Reciprocal Rank Fusion, which needs no score normalisation and no
tuning constants beyond `k`.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from qdrant_client import AsyncQdrantClient, models

from chunking import Chunk, chunk_repository
from embeddings import EMBEDDING_DIMENSIONS, embed_query, embed_texts

logger = logging.getLogger(__name__)

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
COLLECTION = os.environ.get("QDRANT_COLLECTION", "codeatlas_chunks")

# RFF constant. 60 is the value from the original paper and is not sensitive.
_RRF_K = 60


@dataclass
class RetrievedChunk:
    path: str
    symbol: str | None
    language: str
    kind: str
    start_line: int
    end_line: int
    text: str
    score: float

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "symbol": self.symbol,
            "language": self.language,
            "kind": self.kind,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "text": self.text,
            "score": round(self.score, 6),
        }


class RetrievalService:
    """Owns the vector store. Nothing above this layer references Qdrant."""

    def __init__(self, url: str = QDRANT_URL, collection: str = COLLECTION) -> None:
        self._client = AsyncQdrantClient(url=url)
        self._collection = collection
        self._ready = False

    async def ensure_collection(self) -> None:
        """Create the collection and its payload indexes once."""
        if self._ready:
            return

        existing = await self._client.get_collections()
        names = {c.name for c in existing.collections}

        if self._collection not in names:
            await self._client.create_collection(
                collection_name=self._collection,
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIMENSIONS,
                    distance=models.Distance.COSINE,
                ),
            )
            logger.info("Created collection %s", self._collection)

        # `repo` and `file_sha` drive filtering and invalidation; `text` backs the
        # keyword half of hybrid search.
        for field, schema in (
            ("repo", models.PayloadSchemaType.KEYWORD),
            ("path", models.PayloadSchemaType.KEYWORD),
            ("file_sha", models.PayloadSchemaType.KEYWORD),
        ):
            try:
                await self._client.create_payload_index(
                    collection_name=self._collection, field_name=field, field_schema=schema
                )
            except Exception:
                pass  # already exists

        try:
            await self._client.create_payload_index(
                collection_name=self._collection,
                field_name="text",
                field_schema=models.TextIndexParams(
                    type=models.PayloadSchemaType.TEXT,
                    tokenizer=models.TokenizerType.WORD,
                    min_token_len=2,
                    max_token_len=30,
                    lowercase=True,
                ),
            )
        except Exception:
            pass

        self._ready = True

    # ---------------------------------------------------------------- indexing

    async def _indexed_shas(self, repo: str) -> dict[str, str]:
        """Map of path -> file_sha already stored for this repository."""
        shas: dict[str, str] = {}
        offset = None

        while True:
            points, offset = await self._client.scroll(
                collection_name=self._collection,
                scroll_filter=models.Filter(
                    must=[models.FieldCondition(key="repo", match=models.MatchValue(value=repo))]
                ),
                limit=1_000,
                offset=offset,
                with_payload=["path", "file_sha"],
                with_vectors=False,
            )
            for point in points:
                payload = point.payload or {}
                if payload.get("path"):
                    shas[payload["path"]] = payload.get("file_sha", "")
            if offset is None:
                break

        return shas

    async def index_repository(self, repo: str, content: str, *, force: bool = False) -> dict:
        """Chunk, embed and store a repository.

        Incremental by construction: a file whose SHA already matches what is
        stored is skipped entirely — not re-chunked, not re-embedded. Embedding
        is the dominant cost, so this is the difference between a re-index that
        costs nothing and one that costs the whole repository.
        """
        await self.ensure_collection()

        chunks = chunk_repository(content)
        if not chunks:
            return {"indexed": 0, "skipped": 0, "deleted": 0, "chunks": 0}

        existing = {} if force else await self._indexed_shas(repo)

        by_path: dict[str, list[Chunk]] = {}
        for chunk in chunks:
            by_path.setdefault(chunk.path, []).append(chunk)

        changed: list[Chunk] = []
        skipped_files = 0
        for path, file_chunks in by_path.items():
            current_sha = file_chunks[0].file_sha
            if existing.get(path) == current_sha:
                skipped_files += 1
                continue
            changed.extend(file_chunks)

        # Drop stale points for files that changed or disappeared.
        stale_paths = [p for p in by_path if existing.get(p) not in (None, by_path[p][0].file_sha)]
        gone = [p for p in existing if p not in by_path]
        to_delete = stale_paths + gone

        if to_delete:
            await self._client.delete(
                collection_name=self._collection,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[models.FieldCondition(key="repo", match=models.MatchValue(value=repo))],
                        should=[
                            models.FieldCondition(key="path", match=models.MatchValue(value=p))
                            for p in to_delete
                        ],
                    )
                ),
            )

        if not changed:
            logger.info("%s unchanged — %d files skipped", repo, skipped_files)
            return {
                "indexed": 0,
                "skipped": skipped_files,
                "deleted": len(to_delete),
                "chunks": len(chunks),
            }

        texts = [
            f"{c.path}" + (f" — {c.symbol}" if c.symbol else "") + f"\n\n{c.text}"
            for c in changed
        ]
        vectors = await embed_texts(texts)

        await self._client.upsert(
            collection_name=self._collection,
            points=[
                models.PointStruct(
                    id=int(chunk.id),
                    vector=vector,
                    payload={**chunk.to_payload(), "repo": repo},
                )
                for chunk, vector in zip(changed, vectors)
            ],
        )

        logger.info(
            "Indexed %s — %d chunks embedded, %d files skipped, %d stale removed",
            repo, len(changed), skipped_files, len(to_delete),
        )
        return {
            "indexed": len(changed),
            "skipped": skipped_files,
            "deleted": len(to_delete),
            "chunks": len(chunks),
        }

    # --------------------------------------------------------------- retrieval

    async def search(self, repo: str, query: str, *, limit: int = 12) -> list[RetrievedChunk]:
        """Hybrid search: dense + keyword, fused with RRF."""
        await self.ensure_collection()

        repo_filter = models.Filter(
            must=[models.FieldCondition(key="repo", match=models.MatchValue(value=repo))]
        )

        dense_hits = []
        try:
            vector = await embed_query(query)
            dense = await self._client.query_points(
                collection_name=self._collection,
                query=vector,
                query_filter=repo_filter,
                limit=limit * 2,
                with_payload=True,
            )
            dense_hits = list(dense.points)
        except Exception as exc:
            logger.warning("Dense search failed, continuing keyword-only: %s", exc)

        keyword_hits = []
        try:
            points, _ = await self._client.scroll(
                collection_name=self._collection,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(key="repo", match=models.MatchValue(value=repo)),
                        models.FieldCondition(key="text", match=models.MatchText(text=query)),
                    ]
                ),
                limit=limit * 2,
                with_payload=True,
                with_vectors=False,
            )
            keyword_hits = list(points)
        except Exception as exc:
            logger.warning("Keyword search failed, continuing dense-only: %s", exc)

        # Reciprocal Rank Fusion — no score normalisation needed, which matters
        # because cosine similarity and text-match order are not comparable.
        scores: dict[int, float] = {}
        payloads: dict[int, dict] = {}

        for rank, hit in enumerate(dense_hits):
            scores[hit.id] = scores.get(hit.id, 0.0) + 1.0 / (_RRF_K + rank + 1)
            payloads[hit.id] = hit.payload or {}

        for rank, hit in enumerate(keyword_hits):
            scores[hit.id] = scores.get(hit.id, 0.0) + 1.0 / (_RRF_K + rank + 1)
            payloads.setdefault(hit.id, hit.payload or {})

        ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:limit]

        return [
            RetrievedChunk(
                path=payloads[pid].get("path", ""),
                symbol=payloads[pid].get("symbol"),
                language=payloads[pid].get("language", ""),
                kind=payloads[pid].get("kind", ""),
                start_line=payloads[pid].get("start_line", 0),
                end_line=payloads[pid].get("end_line", 0),
                text=payloads[pid].get("text", ""),
                score=score,
            )
            for pid, score in ordered
        ]

    async def status(self, repo: str) -> dict:
        await self.ensure_collection()
        count = await self._client.count(
            collection_name=self._collection,
            count_filter=models.Filter(
                must=[models.FieldCondition(key="repo", match=models.MatchValue(value=repo))]
            ),
            exact=True,
        )
        return {"repo": repo, "chunks": count.count, "indexed": count.count > 0}


_service: RetrievalService | None = None


def get_service() -> RetrievalService:
    global _service
    if _service is None:
        _service = RetrievalService()
    return _service
