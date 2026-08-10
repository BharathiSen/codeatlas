import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { RedisCacheManager } from '@/lib/redis-cache-manager';
import { fetchRepoSize } from '@/lib/github';
import { apiError, apiSuccess, ErrorCode, isValidRepoSegment } from '@/lib/api-response';
import { indexRepository } from '@/lib/retrieval';

/**
 * Largest repository we will attempt to ingest, in kilobytes.
 *
 * Ingestion runs inline within the request and is bounded at 120s, so a
 * repository that cannot finish in that window fails as a timeout with nothing
 * to show for it. Refusing up front costs one cheap metadata call and gives the
 * user an actionable message instead. Default 150 MB.
 */
const MAX_REPO_SIZE_KB = Number(process.env.MAX_REPO_SIZE_KB ?? 150_000);

const INGEST_TIMEOUT_MS = 120_000;

export async function POST(req: NextRequest) {
    try {
        const { username, repo, force_refresh = false } = await req.json();

        if (!username || !repo) {
            return apiError(
                ErrorCode.MISSING_PARAMETERS,
                'Both "username" and "repo" are required.',
                400
            );
        }

    if (!isValidRepoSegment(username) || !isValidRepoSegment(repo)) {
      return apiError(
        ErrorCode.INVALID_REQUEST,
        'Owner and repository must contain only letters, numbers, dots, hyphens and underscores.',
        400
      );
    }

        const repoUrl = `https://github.com/${username}/${repo}`;
        const apiUrl = process.env.GITINGEST_API_URL;

        if (!apiUrl) {
            return apiError(
                ErrorCode.NOT_CONFIGURED,
                'GITINGEST_API_URL is not set in the environment.',
                500
            );
        }

        // Check cache first unless force refresh is requested
        if (!force_refresh) {
            const cachedData = await RedisCacheManager.getFromCache(username, repo);
            if (cachedData) {
                logger.info(`Retrieved data from cache for ${repoUrl}`, { prefix: 'GitIngest' });
                return apiSuccess(cachedData, { cached: true });
            }
        }

        // Size preflight — refuse oversized repositories before spending 120s on them.
        try {
            const { sizeKb, isPrivate } = await fetchRepoSize(username, repo);

            if (isPrivate) {
                return apiError(
                    ErrorCode.REPO_PRIVATE,
                    `${username}/${repo} is private. CodeAtlas can only map public repositories.`,
                    403
                );
            }

            if (sizeKb > MAX_REPO_SIZE_KB) {
                logger.warn(
                    `Refusing ${repoUrl}: ${sizeKb}KB exceeds the ${MAX_REPO_SIZE_KB}KB limit`,
                    { prefix: 'GitIngest' }
                );
                return apiError(
                    ErrorCode.REPO_TOO_LARGE,
                    `${username}/${repo} is ${Math.round(sizeKb / 1024)} MB, above the ${Math.round(
                        MAX_REPO_SIZE_KB / 1024
                    )} MB limit. Try a smaller repository, or ask about a single file instead.`,
                    413,
                    { sizeKb, limitKb: MAX_REPO_SIZE_KB }
                );
            }

            logger.info(`Size preflight passed for ${repoUrl}: ${sizeKb}KB`, { prefix: 'GitIngest' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';

            if (message.includes('Not Found')) {
                return apiError(
                    ErrorCode.REPO_NOT_FOUND,
                    `Repository ${username}/${repo} was not found. Check the owner and name.`,
                    404
                );
            }

            // A preflight that cannot run should not block ingestion outright —
            // log it and let the ingestion service make the final call.
            logger.warn(`Size preflight unavailable for ${repoUrl}: ${message}`, {
                prefix: 'GitIngest',
            });
        }

        logger.info(`Starting data collection for repository: ${repoUrl} using GitIngest`, { prefix: 'GitIngest' });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(`${apiUrl}/ingest/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.INGEST_SERVICE_TOKEN
                        ? { 'X-Service-Token': process.env.INGEST_SERVICE_TOKEN }
                        : {}),
                },
                body: JSON.stringify({ github_link: repoUrl }),
                signal: controller.signal
            });
        } catch (error) {
            const aborted = error instanceof Error && error.name === 'AbortError';
            if (aborted) {
                logger.error(`Ingestion timed out for ${repoUrl}`, { prefix: 'GitIngest' });
                return apiError(
                    ErrorCode.TIMEOUT,
                    `Ingesting ${username}/${repo} exceeded ${INGEST_TIMEOUT_MS / 1000}s. Try a smaller repository.`,
                    504
                );
            }
            return apiError(
                ErrorCode.UPSTREAM_ERROR,
                'The ingestion service is unreachable. Please try again shortly.',
                502
            );
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            const errorText = await response.text();
            let detail = `Ingestion service returned ${response.status}`;
            try {
                detail = JSON.parse(errorText).detail ?? detail;
            } catch {
                logger.error(`Malformed response from ingestion service: ${errorText}`, {
                    prefix: 'GitIngest',
                });
            }
            return apiError(ErrorCode.UPSTREAM_ERROR, detail, 502);
        }

        const result = await response.json();

        if (!result || typeof result !== 'object') {
            return apiError(
                ErrorCode.UPSTREAM_ERROR,
                'Invalid response format from the ingestion service.',
                502
            );
        }

        const metrics = {
            files: result.summary?.match(/Files analyzed: (\d+)/)?.at(1) || 0,
            tokens: result.summary?.match(/Estimated tokens: (\d+)/)?.at(1) || 0,
            chars: result.content?.length || 0
        };
        logger.info(`Repository metrics - Files: ${metrics.files}, Tokens: ${metrics.tokens}, Characters: ${metrics.chars}`, { prefix: 'GitIngest' });

        let data;
        if (result.data && typeof result.data === 'object') {
            data = result.data;
        } else if (result.summary && result.tree && result.content) {
            data = result;
        } else {
            return apiError(
                ErrorCode.UPSTREAM_ERROR,
                'The ingestion service response was missing required fields.',
                502
            );
        }

        if (!data.files) {
            data.files = [];
        }

        // Save successful response to cache, then return exactly what was cached so
        // the hit and miss paths are indistinguishable to callers.
        await RedisCacheManager.saveToCache(username, repo, data);

        // Build the retrieval index. Incremental on the service side, so this is
        // cheap on re-ingestion. Deliberately not awaited: indexing must not add
        // its latency to the user's first page load, and a failure here leaves
        // the whole-repository fallback perfectly usable.
        void indexRepository(username, repo, data.content).catch(() => undefined);

        return apiSuccess(data, { cached: false });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error collecting repository data: ${message}`, { prefix: 'GitIngest' });
        return apiError(
            ErrorCode.INTERNAL_ERROR,
            `Failed to collect repository data: ${message}`,
            500
        );
    }
}
