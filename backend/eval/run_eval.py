"""Measure retrieval quality.

Indexes a labelled fixture, runs every query, and reports recall@k and MRR —
overall and broken down by query kind, because a change that helps exact-symbol
lookup can quietly hurt paraphrase matching and an aggregate number hides that.

Usage:
    python -m eval.run_eval                        # active provider
    EMBEDDING_PROVIDER=local python -m eval.run_eval
    python -m eval.run_eval --compare              # gemini vs local, side by side

The harness is what turns three open opinions into measurements: whether local
384-dim vectors retrieve as well as hosted 768-dim ones, whether a reranker earns
its latency, and whether a chunking change helped or hurt.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.fixture import CORPUS, QUERIES, REPO  # noqa: E402

K_VALUES = (1, 3, 5)


async def _evaluate(collection: str) -> dict:
    """Index the fixture into `collection`, then score every query against it."""
    # Imported here so EMBEDDING_PROVIDER can be set before module import.
    import importlib
    import embeddings
    import retrieval

    importlib.reload(embeddings)
    importlib.reload(retrieval)

    service = retrieval.RetrievalService(collection=collection)

    # Start from a clean collection so a previous run cannot flatter this one.
    try:
        await service._client.delete_collection(collection)
    except Exception:
        pass
    service._ready = False

    started = time.time()
    stats = await service.index_repository(REPO, CORPUS, force=True)
    index_seconds = time.time() - started

    hits = {k: 0 for k in K_VALUES}
    by_kind: dict[str, dict] = {}
    reciprocal_ranks: list[float] = []
    misses: list[tuple[str, str, list[str]]] = []

    for query, expected, kind in QUERIES:
        results = await service.search(REPO, query, limit=max(K_VALUES))
        paths = [r.path for r in results]

        bucket = by_kind.setdefault(kind, {"total": 0, **{k: 0 for k in K_VALUES}})
        bucket["total"] += 1

        rank = paths.index(expected) + 1 if expected in paths else None
        reciprocal_ranks.append(1.0 / rank if rank else 0.0)

        if rank is None:
            misses.append((query, expected, paths[:3]))

        for k in K_VALUES:
            if rank is not None and rank <= k:
                hits[k] += 1
                bucket[k] += 1

    total = len(QUERIES)
    return {
        "collection": collection,
        "chunks": stats.get("indexed", 0),
        "index_seconds": index_seconds,
        "recall": {k: hits[k] / total for k in K_VALUES},
        "mrr": sum(reciprocal_ranks) / total,
        "by_kind": by_kind,
        "misses": misses,
        "dimensions": embeddings.embedding_dimensions(),
        "provider": embeddings.PROVIDER,
    }


def _report(result: dict) -> None:
    print(f"\n  provider   : {result['provider']} ({result['dimensions']} dims)")
    print(f"  indexed    : {result['chunks']} chunks in {result['index_seconds']:.1f}s")
    print(f"  MRR        : {result['mrr']:.3f}")
    for k in K_VALUES:
        print(f"  recall@{k}   : {result['recall'][k]:.1%}")

    print("\n  by query kind:")
    for kind, bucket in sorted(result["by_kind"].items()):
        scores = "  ".join(f"@{k} {bucket[k]}/{bucket['total']}" for k in K_VALUES)
        print(f"    {kind:12} {scores}")

    if result["misses"]:
        print("\n  missed entirely (not in top 5):")
        for query, expected, got in result["misses"]:
            print(f"    {query!r}")
            print(f"      expected {expected}, got {got}")


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Measure retrieval quality")
    parser.add_argument("--compare", action="store_true",
                        help="run both providers and print them side by side")
    args = parser.parse_args()

    if not args.compare:
        _report(await _evaluate(os.environ.get("EVAL_COLLECTION", "codeatlas_eval")))
        return 0

    results = []
    for provider in ("gemini", "local"):
        os.environ["EMBEDDING_PROVIDER"] = provider
        print(f"\n{'=' * 62}\n  evaluating: {provider}\n{'=' * 62}")
        try:
            result = await _evaluate(f"codeatlas_eval_{provider}")
            results.append(result)
            _report(result)
        except Exception as exc:
            print(f"  FAILED: {exc}")

    if len(results) == 2:
        print(f"\n{'=' * 62}\n  comparison\n{'=' * 62}")
        header = f"  {'metric':<14}" + "".join(f"{r['provider']:>12}" for r in results)
        print(header)
        print(f"  {'MRR':<14}" + "".join(f"{r['mrr']:>12.3f}" for r in results))
        for k in K_VALUES:
            print(f"  {'recall@' + str(k):<14}" + "".join(f"{r['recall'][k]:>11.1%} " for r in results))
        print(f"  {'index time':<14}" + "".join(f"{r['index_seconds']:>11.1f}s" for r in results))

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
