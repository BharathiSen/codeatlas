"""Behaviour tests for retrieval: fusion ranking and incremental indexing.

Qdrant is faked. The point is to pin the *logic* that decides what gets
retrieved and what gets re-embedded — the two things that determine answer
quality and cost — without needing a running vector database.
"""

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import retrieval  # noqa: E402
from retrieval import RetrievalService  # noqa: E402


class FakeQdrant:
    """Records what it is asked to do so tests can assert on the decisions."""

    def __init__(self, existing: list[dict] | None = None):
        self.points = list(existing or [])
        self.upserted: list = []
        self.deleted: list = []
        self.dense_results: list = []
        self.keyword_results: list = []

    async def get_collections(self):
        return SimpleNamespace(collections=[SimpleNamespace(name="codeatlas_chunks")])

    async def create_collection(self, **_):
        return None

    async def create_payload_index(self, **_):
        return None

    async def scroll(self, *, scroll_filter=None, **kwargs):
        # Keyword search path — identified by the caller asking for vectors off
        # and payload on, with a text condition present.
        conditions = getattr(scroll_filter, "must", []) or []
        is_keyword = any(getattr(c, "key", None) == "text" for c in conditions)
        if is_keyword:
            return self.keyword_results, None

        points = [
            SimpleNamespace(id=i, payload=p) for i, p in enumerate(self.points)
        ]
        return points, None

    async def query_points(self, **_):
        return SimpleNamespace(points=self.dense_results)

    async def upsert(self, *, points, **_):
        self.upserted.extend(points)

    async def delete(self, **kwargs):
        self.deleted.append(kwargs)

    async def count(self, **_):
        return SimpleNamespace(count=len(self.points))


def make_service(fake: FakeQdrant) -> RetrievalService:
    service = RetrievalService.__new__(RetrievalService)
    service._client = fake
    service._collection = "codeatlas_chunks"
    service._ready = True
    return service


REPO_BLOB = (
    "=" * 20 + "\nFILE: lib/session.py\n" + "=" * 20 + "\n"
    'def validate_session(token):\n'
    '    """Check a session token against the store and report whether it is live."""\n'
    "    return bool(token) and len(token) > 10\n"
)


@pytest.fixture(autouse=True)
def stub_embeddings(monkeypatch):
    """Embedding is a paid network call; tests must never make one."""
    async def fake_embed_texts(texts, **_):
        return [[0.1] * 8 for _ in texts]

    async def fake_embed_query(_query):
        return [0.1] * 8

    monkeypatch.setattr(retrieval, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(retrieval, "embed_query", fake_embed_query)


class TestIncrementalIndexing:
    @pytest.mark.asyncio
    async def test_first_index_embeds_everything(self):
        fake = FakeQdrant()
        stats = await make_service(fake).index_repository("o/r", REPO_BLOB)

        assert stats["indexed"] > 0
        assert stats["skipped"] == 0
        assert fake.upserted, "chunks must reach the store"

    @pytest.mark.asyncio
    async def test_unchanged_content_embeds_nothing(self):
        """The cost-control guarantee: re-indexing an unchanged repo is free."""
        fake = FakeQdrant()
        service = make_service(fake)

        await service.index_repository("o/r", REPO_BLOB)
        indexed_payloads = [p.payload for p in fake.upserted]
        fake.points = indexed_payloads
        fake.upserted.clear()

        stats = await service.index_repository("o/r", REPO_BLOB)

        assert stats["indexed"] == 0
        assert stats["skipped"] >= 1
        assert fake.upserted == [], "nothing should be re-embedded"

    @pytest.mark.asyncio
    async def test_changed_file_is_reindexed(self):
        fake = FakeQdrant()
        service = make_service(fake)

        await service.index_repository("o/r", REPO_BLOB)
        fake.points = [p.payload for p in fake.upserted]
        fake.upserted.clear()

        changed = REPO_BLOB.replace("len(token) > 10", "len(token) > 32  # stricter")
        stats = await service.index_repository("o/r", changed)

        assert stats["indexed"] > 0, "a changed file must be re-embedded"

    @pytest.mark.asyncio
    async def test_force_reindexes_regardless_of_sha(self):
        fake = FakeQdrant()
        service = make_service(fake)

        await service.index_repository("o/r", REPO_BLOB)
        fake.points = [p.payload for p in fake.upserted]
        fake.upserted.clear()

        stats = await service.index_repository("o/r", REPO_BLOB, force=True)

        assert stats["indexed"] > 0
        assert stats["skipped"] == 0

    @pytest.mark.asyncio
    async def test_every_stored_point_is_tagged_with_its_repository(self):
        """Repo isolation — a search must never cross repositories."""
        fake = FakeQdrant()
        await make_service(fake).index_repository("o/r", REPO_BLOB)

        assert all(p.payload["repo"] == "o/r" for p in fake.upserted)


def hit(point_id: int, path: str, symbol: str):
    return SimpleNamespace(
        id=point_id,
        payload={
            "path": path, "symbol": symbol, "language": "python", "kind": "definition",
            "start_line": 1, "end_line": 5, "text": "body",
        },
    )


class TestHybridFusion:
    @pytest.mark.asyncio
    async def test_a_chunk_found_by_both_rankings_outranks_one_found_by_either(self):
        """The core hybrid property — agreement between the two beats a single top hit."""
        fake = FakeQdrant()
        fake.dense_results = [hit(1, "a.py", "alpha"), hit(2, "b.py", "beta")]
        fake.keyword_results = [hit(2, "b.py", "beta"), hit(3, "c.py", "gamma")]

        results = await make_service(fake).search("o/r", "beta")

        assert results[0].symbol == "beta"

    @pytest.mark.asyncio
    async def test_dense_only_results_still_rank(self):
        fake = FakeQdrant()
        fake.dense_results = [hit(1, "a.py", "alpha")]
        fake.keyword_results = []

        results = await make_service(fake).search("o/r", "anything")

        assert [r.symbol for r in results] == ["alpha"]

    @pytest.mark.asyncio
    async def test_keyword_only_results_still_rank(self):
        """Dense failure must degrade to keyword search, not to nothing."""
        fake = FakeQdrant()
        fake.dense_results = []
        fake.keyword_results = [hit(9, "z.py", "zeta")]

        results = await make_service(fake).search("o/r", "zeta")

        assert [r.symbol for r in results] == ["zeta"]

    @pytest.mark.asyncio
    async def test_no_matches_returns_empty_not_an_error(self):
        results = await make_service(FakeQdrant()).search("o/r", "nothing matches")

        assert results == []

    @pytest.mark.asyncio
    async def test_limit_is_respected(self):
        fake = FakeQdrant()
        fake.dense_results = [hit(i, f"f{i}.py", f"s{i}") for i in range(20)]

        results = await make_service(fake).search("o/r", "q", limit=5)

        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_results_carry_citation_metadata(self):
        fake = FakeQdrant()
        fake.dense_results = [hit(1, "lib/session.py", "validate_session")]

        result = (await make_service(fake).search("o/r", "session"))[0]

        assert result.path == "lib/session.py"
        assert result.symbol == "validate_session"
        assert result.start_line == 1
        assert result.score > 0
