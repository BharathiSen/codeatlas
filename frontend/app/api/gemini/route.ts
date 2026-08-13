import { NextResponse } from "next/server";
import { fetchFileContent } from "@/lib/github";
import { generateWithFallback, MODEL_NAME, streamWithFallback } from "@/lib/gemini";
import { logger } from '@/lib/logger';
import {
  buildPrompt,
  estimateTokens,
  getRepoDataForPrompt,
  MAX_PROMPT_TOKENS,
  type ConversationMessage,
  type GitIngestData,
} from '@/lib/prompt-generator';
import { RedisCacheManager } from '@/lib/redis-cache-manager';
import { RateLimiter } from '@/lib/rate-limiter';
import { auth, getQuotaSubject } from '@/lib/auth';
import { persistTurn } from '@/lib/conversations';
import { apiError, ErrorCode, isValidRepoSegment } from '@/lib/api-response';
import { buildRetrievedContext, retrieve } from '@/lib/retrieval';
import { buildRetrievedPrompt } from '@/lib/prompt-generator';
import { currentRequestId, withRequestId } from '@/lib/request-context';
import {
  answerCacheKey,
  isCacheableQuestion,
  type CachedAnswer,
} from '@/lib/answer-cache';

// Define interfaces for data structures
interface ContextStats {
  files: number;
  totalChars: number;
}

/**
 * This route answers with a bespoke envelope rather than `apiSuccess`, so it
 * has to attach the correlation id itself — in the body and the header both,
 * exactly as the shared helpers do.
 */
function jsonWithRequestId(body: Record<string, unknown>): NextResponse {
  const requestId = currentRequestId() ?? crypto.randomUUID();
  return NextResponse.json({ ...body, requestId }, { headers: { 'x-request-id': requestId } });
}

/** NDJSON response headers, shared by the live stream and the cached replay. */
function ndjsonResponse(body: BodyInit): Response {
  const requestId = currentRequestId();
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Stops proxies buffering the response into one delivery.
      'X-Accel-Buffering': 'no',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  });
}

/**
 * Save a completed turn for a signed-in user, if persistence is available.
 *
 * Deliberately swallows everything: a database that is down, unconfigured, or
 * simply not in use must cost the user their history, never their answer. The
 * answer has already been generated and paid for by the time this runs.
 */
async function savePersistedTurn(turn: {
  username: string;
  repo: string;
  query: string;
  answer: string;
  tokenCount: number;
  conversationId?: string;
}): Promise<string | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    return await persistTurn({
      githubId: session.user.id,
      githubLogin: session.user.name ?? undefined,
      owner: turn.username,
      repo: turn.repo,
      conversationId: turn.conversationId,
      question: turn.query,
      answer: turn.answer,
      tokenCount: turn.tokenCount,
      model: MODEL_NAME,
    });
  } catch (error) {
    logger.error(`Conversation not persisted: ${error}`, { prefix: 'DB' });
    return null;
  }
}

/** Serialise fixed events as NDJSON — used when replaying a cached answer. */
function ndjson(events: Array<Record<string, unknown>>): Response {
  return ndjsonResponse(events.map((e) => `${JSON.stringify(e)}\n`).join(''));
}

async function handlePost(req: Request) {
  // Scoped per request: a module-level handle would be shared across concurrent
  // requests and cleared by whichever finished first.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // Signed-in users get their own budget; anonymous callers share one by address.
    const quotaSubject = await getQuotaSubject(req);

    // Check rate limit before processing
    const rateLimitCheck = await RateLimiter.check(quotaSubject);
    if (!rateLimitCheck.allowed) {
      const resetDate = new Date(rateLimitCheck.resetAt * 1000);

      if (rateLimitCheck.degraded) {
        logger.error('Quota store unreachable; refusing request', { prefix: 'RateLimit' });
        return apiError(
          ErrorCode.QUOTA_UNAVAILABLE,
          'The usage quota service is unavailable, so requests are paused. Please try again shortly.',
          503,
          { rateLimit: rateLimitCheck }
        );
      }

      logger.warn(`Rate limit exceeded for ${quotaSubject}`, { prefix: 'RateLimit' });
      return apiError(
        ErrorCode.RATE_LIMITED,
        `Daily limit of ${rateLimitCheck.limit} AI requests reached. Resets at ${resetDate.toLocaleTimeString()}.`,
        429,
        { rateLimited: true, rateLimit: rateLimitCheck }
      );
    }

    const { username, repo, query, filePath, fetchOnlyCurrentFile = false, history = [], stream = false, conversationId } = await req.json();

    // Validate before spending quota. Without this an empty repo/query still
    // reached the model and consumed a request to answer nothing.
    if (!username || !repo || typeof query !== 'string' || query.trim() === '') {
      return apiError(
        ErrorCode.MISSING_PARAMETERS,
        'Fields "username", "repo" and a non-empty "query" are required.',
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

    const repoKey = `${username}/${repo}`;

    /*
     * Answer cache, checked before anything is spent.
     *
     * A hit costs no model call and no quota — the same posture as a cached
     * analysis. It is only consulted for questions that are a pure function of
     * (repository, question); follow-ups and file-scoped questions are not.
     */
    const cacheable = isCacheableQuestion({
      query,
      historyLength: Array.isArray(history) ? history.length : 0,
      fileScoped: Boolean(filePath && fetchOnlyCurrentFile),
    });
    const answerKey = cacheable ? answerCacheKey(username, repo, query) : null;

    if (answerKey) {
      const hit = await RedisCacheManager.getRaw(answerKey);
      if (hit) {
        try {
          const cached: CachedAnswer = JSON.parse(hit);
          const rateLimit = await RateLimiter.check(quotaSubject);
          logger.info(`Answer cache hit for ${repoKey}`, { prefix: 'Cache' });

          /*
           * A cached answer is still an answer this user received, so it joins
           * their conversation. Skipping it would make history depend on
           * whether someone else happened to ask first.
           */
          const savedConversationId = await savePersistedTurn({
            username, repo, query, answer: cached.response,
            tokenCount: cached.usage.estimatedPromptTokens, conversationId,
          });

          if (stream) {
            // Still NDJSON, so a streaming client needs no special case for a
            // cache hit — it simply arrives all at once.
            return ndjson([
              { type: 'chunk', text: cached.response },
              {
                type: 'done',
                rateLimit,
                usage: cached.usage,
                cached: true,
                conversationId: savedConversationId,
              },
            ]);
          }

          return jsonWithRequestId({
            success: true,
            response: cached.response,
            rateLimit,
            usage: cached.usage,
            cached: true,
            conversationId: savedConversationId,
          });
        } catch {
          // A corrupt entry is not worth failing a request over.
          logger.warn(`Discarding unreadable answer cache entry for ${repoKey}`, { prefix: 'Cache' });
        }
      }
    }

    // Set a longer timeout for Vercel
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

    logger.info(`[${new Date().toISOString()}] Starting query processing for repository: ${repoKey}`, { prefix: 'Query' });

    let prompt = '';
    let promptTokens = 0;
    let promptTruncated = false;
    let historyTurns = 0;
    let retrievalUsed = false;
    let chunksUsed = 0;
    /*
     * Why the whole-repository fallback was taken, surfaced on the response.
     *
     * The fallback is deliberate and must never become an error — but it was
     * also invisible: a deployment whose retrieval had silently stopped working
     * kept answering, and reported only `used: false`, which is equally
     * consistent with "not indexed yet". That ambiguity is how Qdrant went
     * unauthenticated in production without anyone noticing (D-42).
     */
    let retrievalFallbackReason: string | undefined;
    let contextStats: ContextStats = { files: 0, totalChars: 0 };

    // Start context preparation
    logger.context.start();

    // Prioritize user query by adding it to the beginning of the prompt
    const userQueryPrompt = `USER QUERY: ${query}\n\n`;

    if (filePath && fetchOnlyCurrentFile) {
      // For specific file queries, fetch only that file's content
      const fileContent = await fetchFileContent(filePath, username, repo);
      prompt = `${userQueryPrompt}You are a helpful assistant that can answer questions about the given code file.

FILE: ${filePath}

${fileContent}

Provide a detailed, technical response that directly addresses the user's query about this specific file.`;

      contextStats.files = 1;
      contextStats.totalChars = fileContent.length;
    } else {
      // For general queries, use GitIngest data
      logger.info(`Collecting repository data for ${repoKey} using GitIngest...`, { prefix: 'Query' });

      try {
        // Skip background content loading if we have cached data
        const hasCachedData = await RedisCacheManager.hasCache(username, repo);
        if (!hasCachedData) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/collect-repo-data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, repo })
            });
          } catch (error) {
            logger.error('Error triggering background content loading: ' + (error instanceof Error ? error.message : 'Unknown error'));
          }
        }

        // Get repository data from GitIngest
        let repoData: GitIngestData | null = null;

        // Check Redis cache first
        try {
          repoData = await RedisCacheManager.getFromCache(username, repo);
          if (repoData) {
            logger.info(`Using cached data for ${repoKey}`, { prefix: 'Context' });

            // Calculate context stats from cached data
            const treeLines = repoData.tree.split('\n');
            const contentChars = repoData.content.length;

            logger.info(`Cached Tree Structure (${treeLines.length} items):`, { prefix: 'Context' });
            // Log first 20 lines of tree to avoid spamming
            logger.info(treeLines.slice(0, 20).join('\n') + (treeLines.length > 20 ? '\n... (truncated)' : ''), { prefix: 'Context' });

            /*
             * Retrieval first. Semantic + keyword search returns the excerpts
             * that matter for this question; stuffing the whole repository is
             * the fallback for when the index is missing or the service is
             * down. Retrieval improves answers — it must never prevent one.
             */
            const retrieved = await retrieve(username, repo, query);

            if (retrieved.available) {
              const budget = buildRetrievedContext(
                retrieved.chunks,
                Math.floor(MAX_PROMPT_TOKENS * 0.7)
              );
              const built = await buildRetrievedPrompt(
                query,
                history as ConversationMessage[],
                repoData.tree,
                budget.context,
                { used: budget.used, omitted: budget.omitted }
              );
              prompt = built.prompt;
              promptTokens = built.estimatedTokens;
              promptTruncated = built.truncated;
              historyTurns = built.historyTurns;
              retrievalUsed = true;
              chunksUsed = budget.used;
              logger.info(
                `Retrieved ${budget.used} chunks for ${repoKey} (${budget.omitted} omitted)`,
                { prefix: 'Retrieval' }
              );
            } else {
              retrievalFallbackReason = retrieved.reason ?? 'unavailable';
              logger.info(
                `Falling back to whole-repository context for ${repoKey} (${retrievalFallbackReason})`,
                { prefix: 'Retrieval' }
              );
              const built = await buildPrompt(query, history as ConversationMessage[], repoData.tree, repoData.content);
              prompt = built.prompt;
              promptTokens = built.estimatedTokens;
              promptTruncated = built.truncated;
              historyTurns = built.historyTurns;
              logger.info(`No index for ${repoKey}; using whole-repository context`, { prefix: 'Retrieval' });
            }

            contextStats.files = treeLines.length;
            contextStats.totalChars = contentChars;

            logger.info(`Generated prompt using cached data for ${repoKey}`, { prefix: 'Prompt' });
          }
        } catch (error) {
          logger.error(`Cache retrieval failed: ${error}`, { prefix: 'Context' });
        }

        if (!repoData) {
          // Existing GitIngest processing logic
          const gitIngestData: GitIngestData = await getRepoDataForPrompt(username, repo);

          if (gitIngestData && !gitIngestData.error) {
            logger.info(`Retrieved GitIngest data for repository: ${repoKey}`, { prefix: 'GitIngest' });

            // Calculate context stats from repo data
            const treeLines = gitIngestData.tree.split('\n').length;
            const contentChars = gitIngestData.content.length;

            // Generate prompt using the GitIngest data
            const built = await buildPrompt(query, history as ConversationMessage[], gitIngestData.tree, gitIngestData.content);
            prompt = built.prompt;
            promptTokens = built.estimatedTokens;
            promptTruncated = built.truncated;
            historyTurns = built.historyTurns;

            contextStats.files = treeLines; // Approximation based on tree lines
            contextStats.totalChars = contentChars;

            logger.info(`Generated prompt for query using GitIngest data`, { prefix: 'Prompt' });
          } else {
            // Fallback if GitIngest data is not available
            logger.warn(`GitIngest data not available for ${repoKey}, using fallback prompt`, { prefix: 'GitIngest' });
            prompt = `You are a knowledgeable AI assistant with deep understanding of software development and GitHub repositories. 

Repository: ${repoKey}

${userQueryPrompt}Provide an insightful, technical response that directly addresses the user's query about this repository.`;
          }
        }
      } catch (error) {
        logger.error('Error generating prompt with GitIngest: ' + (error instanceof Error ? error.message : 'Unknown error'));
        prompt = `You are a knowledgeable AI assistant with deep understanding of software development and GitHub repositories. 

Repository: ${repoKey}

${userQueryPrompt}Provide an insightful, technical response that directly addresses the user's query about this repository.`;
      }
    }

    // After all context is prepared
    logger.context.stats(contextStats);

    // Cost gate: the prompt is priced before it is sent, not after. The file-scoped
    // and fallback paths bypass buildPrompt, so measure whatever we ended up with.
    if (promptTokens === 0) {
      promptTokens = estimateTokens(prompt);
    }

    logger.info(
      `Prompt ready — ~${promptTokens} tokens, ${historyTurns} history turn(s)` +
        (promptTruncated ? ', content truncated to fit budget' : ''),
      { prefix: 'Prompt' }
    );

    if (promptTokens > MAX_PROMPT_TOKENS) {
      clearTimeout(timeoutId);
      logger.warn(
        `Refusing ${repoKey}: ~${promptTokens} tokens exceeds the ${MAX_PROMPT_TOKENS} budget`,
        { prefix: 'Prompt' }
      );
      return apiError(
        ErrorCode.CONTEXT_TOO_LARGE,
        'This repository is too large to answer against as a whole. Open a file and ask about it directly.',
        413,
        { estimatedTokens: promptTokens, maxTokens: MAX_PROMPT_TOKENS }
      );
    }

    /*
     * Streaming is opt-in via `stream: true`. Without it the JSON envelope below
     * is byte-for-byte what it always was, so existing callers are unaffected.
     *
     * The stream is newline-delimited JSON rather than raw text: the client still
     * needs the rateLimit and usage metadata that the envelope carries, and a
     * mid-stream failure has to be distinguishable from a truncated answer.
     */
    if (stream) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        async start(controller) {
          const send = (event: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

          try {
            // Accumulated so a streamed answer populates the cache too —
            // otherwise whether a question is billed twice would depend on
            // which transport the first caller happened to use.
            let full = '';

            for await (const chunk of streamWithFallback(prompt)) {
              full += chunk;
              send({ type: 'chunk', text: chunk });
            }

            const rateLimit = await RateLimiter.increment(quotaSubject);
            const usage = {
              estimatedPromptTokens: promptTokens,
              truncated: promptTruncated,
              historyTurns,
              retrieval: retrievalUsed
        ? { used: true, chunks: chunksUsed }
        : { used: false, reason: retrievalFallbackReason ?? 'unavailable' },
            };

            if (answerKey && full) {
              await RedisCacheManager.saveRaw(answerKey, JSON.stringify({ response: full, usage }));
            }

            const savedConversationId = await savePersistedTurn({
              username, repo, query, answer: full, tokenCount: promptTokens, conversationId,
            });

            send({ type: 'done', rateLimit, usage, conversationId: savedConversationId });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Streaming failed: ${message}`, { prefix: 'Gemini' });
            send({ type: 'error', code: ErrorCode.GENERATION_FAILED, error: message });
          } finally {
            clearTimeout(timeoutId);
            controller.close();
          }
        },
      });

      return ndjsonResponse(body);
    }

    // Generate response using Gemini (with fallback to secondary key)
    const response = await generateWithFallback(prompt);

    // Increment rate limit counter after successful response
    const rateLimit = await RateLimiter.increment(quotaSubject);

    const usage = {
      estimatedPromptTokens: promptTokens,
      truncated: promptTruncated,
      historyTurns,
      retrieval: retrievalUsed
        ? { used: true, chunks: chunksUsed }
        : { used: false, reason: retrievalFallbackReason ?? 'unavailable' },
    };

    // Written after the answer succeeded, so a failed generation is never cached.
    if (answerKey) {
      await RedisCacheManager.saveRaw(answerKey, JSON.stringify({ response, usage }));
    }

    const savedConversationId = await savePersistedTurn({
      username, repo, query, answer: response, tokenCount: promptTokens, conversationId,
    });

    clearTimeout(timeoutId);
    return jsonWithRequestId({
      success: true, response, rateLimit, usage, conversationId: savedConversationId,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('timeout');

    logger.error(`Error processing Gemini request: ${errorMessage}`);

    if (isTimeout) {
      return apiError(
        ErrorCode.TIMEOUT,
        'Request timed out. Please try with a smaller repository or a specific file query.',
        504
      );
    }

    // Provider quota exhaustion is upstream, not the caller's daily budget —
    // distinguish it so the client does not report a limit the user has not hit.
    const isUpstreamQuota = /quota|rate limit|429|RESOURCE_EXHAUSTED/i.test(errorMessage);
    if (isUpstreamQuota) {
      return apiError(
        ErrorCode.UPSTREAM_RATE_LIMITED,
        'The AI provider is rate-limiting requests right now. Please try again shortly.',
        503
      );
    }

    return apiError(
      ErrorCode.GENERATION_FAILED,
      `Failed to process request: ${errorMessage}`,
      500
    );
  }
}

/*
 * Wrapped so `apiSuccess` / `apiError` / `logger` all reach the same request
 * id without it being threaded through every call site.
 */
export const POST = withRequestId(handlePost);
