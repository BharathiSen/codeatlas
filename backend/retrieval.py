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

# `qdrant_client` is imported inside the methods that use it, not here. It is the
# single most expensive import in this service — ~6.4s of the ~8.5s uvicorn spent
# before binding its port — and main.py pulls this module in at startup.
# Deferring it opens the port promptly, so a cold Render Free instance stops
# answering 502 while it wakes. sys.modules caches it, so only the first call
# pays. See D-41.

from chunking import Chunk, chunk_repository
from embeddings import embed_query, embed_texts, embedding_dimensions

logger = logging.getLogger(__name__)

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
COLLECTION = os.environ.get("QDRANT_COLLECTION", "codeatlas_chunks")

# Managed Qdrant requires an API key; a local container does not. Empty means
# "no credential", which is correct for `docker run qdrant/qdrant` and wrong for
# every hosted cluster — without it the client is rejected with a bare
# `403 Forbidden` that reads like a networking problem rather than an auth one.
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "").strip()

# RFF constant. 60 is the value from the original paper and is not sensitive.
_RRF_K = 60

# Chunks held in flight while indexing. Deliberately a multiple of the embedding
# batch size rather than a new setting, so `embed_texts` still paces itself
# between its own sub-batches exactly as before — this bounds memory without
# touching rate-limit behaviour.
_INDEX_BATCH_CHUNKS = int(os.environ.get("EMBEDDING_BATCH_SIZE", "8")) * 8


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
        from qdrant_client import AsyncQdrantClient

        # `api_key=None` rather than "" — the client sends no auth header at all
        # when unset, which is what an unauthenticated local Qdrant expects.
        self._client = AsyncQdrantClient(url=url, api_key=QDRANT_API_KEY or None)
        self._collection = collection
        self._ready = False

    async def ensure_collection(self) -> None:
        """Create the collection and its payload indexes once."""
        from qdrant_client import models

        if self._ready:
            return

        existing = await self._client.get_collections()
        names = {c.name for c in existing.collections}

        dimensions = embedding_dimensions()

        if self._collection not in names:
            await self._client.create_collection(
                collection_name=self._collection,
                vectors_config=models.VectorParams(
                    size=dimensions,
                    distance=models.Distance.COSINE,
                ),
            )
            logger.info("Created collection %s at %d dimensions", self._collection, dimensions)
        else:
            # Switching embedding provider changes the vector width. Searching a
            # collection built at another width fails deep inside Qdrant with an
            # opaque error, so surface it here with the actual fix.
            info = await self._client.get_collection(self._collection)
            existing_size = info.config.params.vectors.size
            if existing_size != dimensions:
                raise RuntimeError(
                    f"Collection '{self._collection}' stores {existing_size}-dimensional vectors "
                    f"but the active embedding provider produces {dimensions}. "
                    f"Delete the collection and re-index, or set QDRANT_COLLECTION to a new name."
                )

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
        from qdrant_client import models

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
        from qdrant_client import models

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

        # Bounded pipeline: embed and upsert one slice at a time, releasing each
        # slice before starting the next. The previous shape built the complete
        # texts, vectors and points lists and held all three alive at once, on top
        # of the repository string still in scope — four representations of the
        # same content, which is what exhausts a 512 MB instance (D-41).
        for start in range(0, len(changed), _INDEX_BATCH_CHUNKS):
            batch = changed[start:start + _INDEX_BATCH_CHUNKS]

            texts = [
                f"{c.path}" + (f" — {c.symbol}" if c.symbol else "") + f"\n\n{c.text}"
                for c in batch
            ]
            vectors = await embed_texts(texts)
            del texts

            await self._client.upsert(
                collection_name=self._collection,
                points=[
                    models.PointStruct(
                        id=int(chunk.id),
                        vector=vector,
                        payload={**chunk.to_payload(), "repo": repo},
                    )
                    for chunk, vector in zip(batch, vectors)
                ],
            )
            del vectors, batch

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
        from qdrant_client import models

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
        from qdrant_client import models

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
