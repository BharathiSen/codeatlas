import { NextRequest } from 'next/server';
import { fetchUserProfile } from '@/lib/github';
import { apiError, apiSuccess, ErrorCode, isValidRepoSegment } from '@/lib/api-response';
import { withRequestId } from '@/lib/request-context';
import { logger } from '@/lib/logger';

/**
 * A GitHub user's profile and repositories, fetched server-side.
 *
 * The profile page used to call api.github.com directly from the browser. That
 * is unauthenticated — 60 requests per hour per IP — so on any shared or cloud
 * address it returns 403 and the page renders "Failed to load profile". Going
 * through the server uses the configured token (5,000/hour) and keeps that token
 * where it belongs.
 *
 * Read-only and free: GitHub metadata costs nothing and spends no quota, which is
 * why this needs no service token of its own.
 */
async function handler(req: NextRequest) {
  const username = new URL(req.url).searchParams.get('username');

  if (!isValidRepoSegment(username)) {
    return apiError(ErrorCode.INVALID_REQUEST, 'A valid GitHub username is required.', 400);
  }

  try {
    return apiSuccess(await fetchUserProfile(username));
  } catch (error) {
    const status = (error as { status?: number })?.status;

    if (status === 404) {
      return apiError(ErrorCode.REPO_NOT_FOUND, `No GitHub user named "${username}".`, 404);
    }

    if (status === 403 || status === 429) {
      return apiError(
        ErrorCode.RATE_LIMITED,
        'GitHub is rate-limiting requests right now. Please try again shortly.',
        429
      );
    }

    logger.error(
      `Profile lookup failed for ${username}: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
      { prefix: 'GitHub' }
    );
    return apiError(ErrorCode.UPSTREAM_ERROR, 'Could not load this profile from GitHub.', 502);
  }
}

export const GET = withRequestId(handler);
