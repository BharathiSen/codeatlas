"""Embedding pipeline.

Gemini embeddings, batched and dimension-truncated. Kept behind a small
interface so the provider is swappable — the notebook's engineering goals call
for provider-swappable AI, and an embedding model is the hardest thing to change
later because it invalidates every stored vector.
"""

from __future__ import annotations

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

def _api_key() -> str:
    """Read at call time: the key may be loaded after this module is imported."""
    return os.environ.get("GEMINI_API_KEY", "")


EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "gemini-embedding-001")

# Gemini returns 3072 dimensions; the model supports Matryoshka truncation.
# 768 keeps Qdrant storage and search latency at a quarter of the cost for a
# retrieval-quality difference that is not measurable at this corpus size.
EMBEDDING_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "768"))

# Requests are issued concurrently but bounded — the free tier rate-limits hard.
# 8 in flight with a short pause between batches keeps a full index inside the
# per-minute quota; a burst of 16 reliably tripped 429 partway through.
_BATCH_SIZE = int(os.environ.get("EMBEDDING_BATCH_SIZE", "8"))
_BATCH_PAUSE_SECONDS = float(os.environ.get("EMBEDDING_BATCH_PAUSE", "0.6"))
_TIMEOUT_SECONDS = 120

# A 429 is transient. Failing the whole index because one request arrived a
# second too early would waste every embedding already paid for.
_MAX_RETRIES = 5
_BACKOFF_BASE_SECONDS = 2.0

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class EmbeddingError(RuntimeError):
    pass


async def _embed_one(client: httpx.AsyncClient, text: str, task_type: str) -> list[float]:
    """Embed one text, retrying transient rate limits with exponential backoff."""
    last_error = ""

    for attempt in range(_MAX_RETRIES):
        response = await client.post(
            f"{_BASE}/{EMBEDDING_MODEL}:embedContent",
            params={"key": _api_key()},
            json={
                "model": f"models/{EMBEDDING_MODEL}",
                "content": {"parts": [{"text": text[:36_000]}]},
                "taskType": task_type,
                "outputDimensionality": EMBEDDING_DIMENSIONS,
            },
        )

        if response.status_code == 200:
            values = response.json().get("embedding", {}).get("values")
            if not values:
                raise EmbeddingError("response contained no embedding")
            return values

        last_error = f"{response.status_code}: {response.text[:160]}"

        # Retry rate limits and transient server errors; fail fast on the rest,
        # since a 400 will not become a 200 no matter how long we wait.
        if response.status_code not in (429, 500, 502, 503, 504):
            raise EmbeddingError(last_error)

        delay = _BACKOFF_BASE_SECONDS * (2 ** attempt)
        logger.warning("Embedding %s — retrying in %.1fs (attempt %d/%d)",
                       response.status_code, delay, attempt + 1, _MAX_RETRIES)
        await asyncio.sleep(delay)

    raise EmbeddingError(f"exhausted retries — {last_error}")


async def embed_texts(texts: list[str], *, task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """Embed many texts, preserving input order.

    `task_type` matters: Gemini embeds documents and queries into the same space
    but optimises them differently, so indexing must use RETRIEVAL_DOCUMENT and
    search must use RETRIEVAL_QUERY. Mixing them measurably degrades recall.
    """
    if not _api_key():
        raise EmbeddingError("GEMINI_API_KEY is not configured")
    if not texts:
        return []

    vectors: list[list[float]] = []

    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
        for start in range(0, len(texts), _BATCH_SIZE):
            batch = texts[start:start + _BATCH_SIZE]
            results = await asyncio.gather(
                *(_embed_one(client, text, task_type) for text in batch),
                return_exceptions=True,
            )

            for index, result in enumerate(results):
                if isinstance(result, Exception):
                    raise EmbeddingError(
                        f"embedding failed for item {start + index}: {result}"
                    ) from result
                vectors.append(result)

            logger.info("Embedded %d/%d chunks", len(vectors), len(texts))

            # Spread load across the per-minute quota window.
            if start + _BATCH_SIZE < len(texts):
                await asyncio.sleep(_BATCH_PAUSE_SECONDS)

    return vectors


async def embed_query(query: str) -> list[float]:
    """Embed a search query. Uses the query-side task type — see `embed_texts`."""
    vectors = await embed_texts([query], task_type="RETRIEVAL_QUERY")
    return vectors[0]
