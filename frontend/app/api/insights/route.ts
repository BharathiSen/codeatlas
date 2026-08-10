import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { RedisCacheManager } from '@/lib/redis-cache-manager';
import { generateWithFallback } from '@/lib/gemini';
import { getClientIP, RateLimiter } from '@/lib/rate-limiter';
import { apiError, apiSuccess, ErrorCode } from '@/lib/api-response';
import {
  applyTokenBudget,
  estimateTokens,
  MAX_PROMPT_TOKENS,
} from '@/lib/prompt-generator';
import {
  buildInsightInstruction,
  insightCacheKey,
  isInsightKind,
  type CachedInsight,
  type InsightKind,
} from '@/lib/insights';

/**
 * Analyses run longer and produce more structure than a chat turn, so they get
 * more room to answer. Still bounded — this is a document, not an essay.
 */
const INSIGHT_MAX_OUTPUT_TOKENS = 4096;

/**
 * Lower than the assistant's 0.8. These outputs are structural claims about a
 * codebase, where invention is the main failure mode and variety has no value.
 */
const INSIGHT_TEMPERATURE = 0.2;

/** Rough size of the framing text wrapped around the repository context. */
const INSIGHT_OVERHEAD_TOKENS = 1_500;

export async function POST(req: NextRequest) {
  try {
    const clientIP = getClientIP(req);

    const rateLimitCheck = await RateLimiter.check(clientIP);
    if (!rateLimitCheck.allowed) {
      if (rateLimitCheck.degraded) {
        return apiError(
          ErrorCode.QUOTA_UNAVAILABLE,
          'The usage quota service is unavailable, so analyses are paused. Please try again shortly.',
          503,
          { rateLimit: rateLimitCheck }
        );
      }
      const resetDate = new Date(rateLimitCheck.resetAt * 1000);
      return apiError(
        ErrorCode.RATE_LIMITED,
        `Daily limit of ${rateLimitCheck.limit} AI requests reached. Resets at ${resetDate.toLocaleTimeString()}.`,
        429,
        { rateLimit: rateLimitCheck }
      );
    }

    const { username, repo, kind, force_refresh = false } = await req.json();

    if (!username || !repo || !kind) {
      return apiError(
        ErrorCode.MISSING_PARAMETERS,
        'Fields "username", "repo" and "kind" are required.',
        400
      );
    }

    if (!isInsightKind(kind)) {
      return apiError(ErrorCode.INVALID_REQUEST, `Unknown insight kind "${kind}".`, 400);
    }

    const insightKind = kind as InsightKind;
    const repoKey = `${username}/${repo}`;
    const cacheKey = insightCacheKey(username, repo, insightKind);

    // An analysis over an unchanged repository is deterministic enough to reuse,
    // and it is the most expensive thing this product does. Serve it from cache
    // without consuming quota.
    if (!force_refresh) {
      const cached = await RedisCacheManager.getRaw(cacheKey);
      if (cached) {
        try {
          const parsed: CachedInsight = JSON.parse(cached);
          logger.info(`Insight cache hit: ${insightKind} for ${repoKey}`, { prefix: 'Insights' });
          return apiSuccess(
            { kind: insightKind, markdown: parsed.markdown },
            { cached: true, usage: { truncated: parsed.truncated } }
          );
        } catch {
          // Malformed entry — fall through and regenerate rather than serve junk.
          logger.warn(`Discarding unparsable cache entry ${cacheKey}`, { prefix: 'Insights' });
        }
      }
    }

    // Repository context comes from the same warm cache the assistant uses.
    const repoData = await RedisCacheManager.getFromCache(username, repo);
    if (!repoData?.tree || !repoData?.content) {
      return apiError(
        ErrorCode.REPO_NOT_FOUND,
        'This repository has not been ingested yet. Open it from the landing page first.',
        409
      );
    }

    const instruction = buildInsightInstruction(insightKind);

    const overhead =
      INSIGHT_OVERHEAD_TOKENS + estimateTokens(instruction) + estimateTokens(repoData.tree);
    const budget = applyTokenBudget(repoData.content, overhead);

    const prompt = `You are analysing a software repository. Work only from the material below.

REPOSITORY: ${repoKey}

FOLDER STRUCTURE:
${repoData.tree}

FILE CONTENT:
${budget.content}

${instruction}`;

    const promptTokens = estimateTokens(prompt);

    if (promptTokens > MAX_PROMPT_TOKENS) {
      logger.warn(
        `Refusing ${insightKind} for ${repoKey}: ~${promptTokens} tokens over budget`,
        { prefix: 'Insights' }
      );
      return apiError(
        ErrorCode.CONTEXT_TOO_LARGE,
        'This repository is too large to analyse as a whole.',
        413,
        { estimatedTokens: promptTokens, maxTokens: MAX_PROMPT_TOKENS }
      );
    }

    logger.info(
      `Generating ${insightKind} for ${repoKey} — ~${promptTokens} tokens` +
        (budget.truncated ? ', content truncated to fit budget' : ''),
      { prefix: 'Insights' }
    );

    const markdown = await generateWithFallback(prompt, {
      temperature: INSIGHT_TEMPERATURE,
      maxOutputTokens: INSIGHT_MAX_OUTPUT_TOKENS,
    });

    const record: CachedInsight = { markdown, truncated: budget.truncated };
    await RedisCacheManager.saveRaw(cacheKey, JSON.stringify(record));
    const rateLimit = await RateLimiter.increment(clientIP);

    return apiSuccess(
      { kind: insightKind, markdown },
      {
        cached: false,
        rateLimit,
        usage: { estimatedPromptTokens: promptTokens, truncated: budget.truncated },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Insight generation failed: ${message}`, { prefix: 'Insights' });

    if (/quota|rate limit|429|RESOURCE_EXHAUSTED/i.test(message)) {
      return apiError(
        ErrorCode.UPSTREAM_RATE_LIMITED,
        'The AI provider is rate-limiting requests right now. Please try again shortly.',
        503
      );
    }

    return apiError(ErrorCode.GENERATION_FAILED, `Failed to generate analysis: ${message}`, 500);
  }
}
