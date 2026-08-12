import { NextRequest } from 'next/server';
import { apiError, apiSuccess, ErrorCode, isValidRepoSegment } from '@/lib/api-response';
import { withRequestId } from '@/lib/request-context';
import { logger } from '@/lib/logger';

/**
 * Indexing progress for a repository.
 *
 * Exists so the landing page can show what the pipeline is actually doing rather
 * than a spinner and a guess. The retrieval service already tracks this — the
 * browser simply has no way to reach it: the backend lives on another origin and
 * is not addressable from client code. This proxies the one endpoint that is
 * safe to expose.
 *
 * Read-only, and it spends nothing: `/index/status` counts stored points. It is
 * the only backend endpoint without a service token, deliberately, because
 * knowing how many chunks a public repository has costs nothing to reveal. The
 * token stays server-side for `/ingest/`, `/index/` and `/search/`, which do
 * spend money.
 */

const STATUS_TIMEOUT_MS = 5_000;

async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const repo = searchParams.get('repo');

  if (!isValidRepoSegment(username) || !isValidRepoSegment(repo)) {
    return apiError(ErrorCode.INVALID_REQUEST, 'A valid owner and repository are required.', 400);
  }

  const apiUrl = process.env.GITINGEST_API_URL;
  if (!apiUrl) {
    // Not an error the visitor can act on: without the retrieval service there
    // is simply no index to report. Answering still works via the fallback.
    return apiSuccess({ indexed: false, chunks: 0, available: false });
  }

  try {
    const response = await fetch(
      `${apiUrl}/index/status?repo=${encodeURIComponent(`${username}/${repo}`)}`,
      { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS), cache: 'no-store' }
    );

    if (!response.ok) {
      return apiSuccess({ indexed: false, chunks: 0, available: false });
    }

    const body = await response.json();
    const data = body?.data ?? {};

    return apiSuccess({
      indexed: Boolean(data.indexed),
      chunks: Number(data.chunks ?? 0),
      available: true,
    });
  } catch (error) {
    // A sleeping or unreachable backend is expected here and must not surface as
    // a failure — the caller is polling for progress, not correctness.
    logger.debug(
      `Index status unavailable for ${username}/${repo}: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
      { prefix: 'Retrieval' }
    );
    return apiSuccess({ indexed: false, chunks: 0, available: false });
  }
}

export const GET = withRequestId(handler);
