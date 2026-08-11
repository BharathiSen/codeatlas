"""Embedding pipeline with swappable providers.

Two providers behind one interface:

- **gemini** — hosted, 768-dim (Matryoshka-truncated from 3072). Better quality,
  costs money, and rate-limits hard enough that indexing a real repository on the
  free tier does not complete.
- **local** — `fastembed` running `bge-small-en-v1.5` on CPU via ONNX, 384-dim.
  No quota, no per-token cost, no network. This is what makes indexing a large
  repository possible without a billing account.

`EMBEDDING_PROVIDER` selects between them. Dimensions are a property of the
provider, never a free-floating setting: a collection built at one width cannot
be searched at another, so letting them drift silently is the worst failure mode
in this file.
"""

from __future__ import annotations

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

PROVIDER = os.environ.get("EMBEDDING_PROVIDER", "gemini").strip().lower()

# --- Gemini -----------------------------------------------------------------

GEMINI_MODEL = os.environ.get("EMBEDDING_MODEL", "gemini-embedding-001")
GEMINI_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "768"))

_BATCH_SIZE = int(os.environ.get("EMBEDDING_BATCH_SIZE", "8"))
_BATCH_PAUSE_SECONDS = float(os.environ.get("EMBEDDING_BATCH_PAUSE", "0.6"))
_TIMEOUT_SECONDS = 120

# A 429 is transient. Failing the whole index because one request arrived a
# second too early would waste every embedding already paid for.
_MAX_RETRIES = 5
_BACKOFF_BASE_SECONDS = 2.0

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# --- Local ------------------------------------------------------------------

LOCAL_MODEL = os.environ.get("LOCAL_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
_LOCAL_DIMENSIONS = {
    "BAAI/bge-small-en-v1.5": 384,
    "BAAI/bge-base-en-v1.5": 768,
    "sentence-transformers/all-MiniLM-L6-v2": 384,
}

_local_model = None


class EmbeddingError(RuntimeError):
    pass


def _api_key() -> str:
    """Read at call time: the key may be loaded after this module is imported."""
    return os.environ.get("GEMINI_API_KEY", "")


def embedding_dimensions() -> int:
    """Vector width for the active provider. The collection is built at this size."""
    if PROVIDER == "local":
        return _LOCAL_DIMENSIONS.get(LOCAL_MODEL, 384)
    return GEMINI_DIMENSIONS


# Backwards-compatible constant. Prefer `embedding_dimensions()`.
EMBEDDING_DIMENSIONS = embedding_dimensions()


# --- Local provider ---------------------------------------------------------

def _get_local_model():
    """Load the ONNX model once. First call downloads it (~130 MB), then caches."""
    global _local_model
    if _local_model is None:
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:  # pragma: no cover
            raise EmbeddingError(
                "EMBEDDING_PROVIDER=local requires fastembed — pip install fastembed"
            ) from exc

        logger.info("Loading local embedding model %s (first run downloads it)", LOCAL_MODEL)
        _local_model = TextEmbedding(LOCAL_MODEL)
    return _local_model


def _embed_local_sync(texts: list[str]) -> list[list[float]]:
    model = _get_local_model()
    return [vector.tolist() for vector in model.embed(texts)]


async def _embed_local(texts: list[str]) -> list[list[float]]:
    """Run CPU-bound embedding off the event loop so the service stays responsive."""
    return await asyncio.to_thread(_embed_local_sync, texts)


# --- Gemini provider --------------------------------------------------------

async def _embed_one(client: httpx.AsyncClient, text: str, task_type: str) -> list[float]:
    """Embed one text, retrying transient rate limits with exponential backoff."""
    last_error = ""

    for attempt in range(_MAX_RETRIES):
        response = await client.post(
            f"{_BASE}/{GEMINI_MODEL}:embedContent",
            params={"key": _api_key()},
            json={
                "model": f"models/{GEMINI_MODEL}",
                "content": {"parts": [{"text": text[:36_000]}]},
                "taskType": task_type,
                "outputDimensionality": GEMINI_DIMENSIONS,
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


async def _embed_gemini(texts: list[str], task_type: str) -> list[list[float]]:
    if not _api_key():
        raise EmbeddingError("GEMINI_API_KEY is not configured")

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


# --- Public interface -------------------------------------------------------

async def embed_texts(texts: list[str], *, task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """Embed many texts, preserving input order.

    `task_type` applies to Gemini only: it embeds documents and queries into the
    same space but optimises them differently, so indexing must use
    RETRIEVAL_DOCUMENT and search RETRIEVAL_QUERY. bge encodes both symmetrically
    and ignores the distinction.
    """
    if not texts:
        return []

    if PROVIDER == "local":
        return await _embed_local(texts)

    return await _embed_gemini(texts, task_type)


async def embed_query(query: str) -> list[float]:
    """Embed a search query."""
    vectors = await embed_texts([query], task_type="RETRIEVAL_QUERY")
    return vectors[0]
