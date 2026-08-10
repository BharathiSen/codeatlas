import { NextResponse } from "next/server";
import { fetchFileContent } from "@/lib/github";
import { generateWithFallback, streamWithFallback } from "@/lib/gemini";
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
import { getClientIP, RateLimiter } from '@/lib/rate-limiter';
import { apiError, ErrorCode } from '@/lib/api-response';
import { buildRetrievedContext, retrieve } from '@/lib/retrieval';
import { buildRetrievedPrompt } from '@/lib/prompt-generator';

// Define interfaces for data structures
interface ContextStats {
  files: number;
  totalChars: number;
}

export async function POST(req: Request) {
  // Scoped per request: a module-level handle would be shared across concurrent
  // requests and cleared by whichever finished first.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(req);

    // Check rate limit before processing
    const rateLimitCheck = await RateLimiter.check(clientIP);
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

      logger.warn(`Rate limit exceeded for IP: ${clientIP}`, { prefix: 'RateLimit' });
      return apiError(
        ErrorCode.RATE_LIMITED,
        `Daily limit of ${rateLimitCheck.limit} AI requests reached. Resets at ${resetDate.toLocaleTimeString()}.`,
        429,
        { rateLimited: true, rateLimit: rateLimitCheck }
      );
    }

    const { username, repo, query, filePath, fetchOnlyCurrentFile = false, history = [], stream = false } = await req.json();

    // Validate before spending quota. Without this an empty repo/query still
    // reached the model and consumed a request to answer nothing.
    if (!username || !repo || typeof query !== 'string' || query.trim() === '') {
      return apiError(
        ErrorCode.MISSING_PARAMETERS,
        'Fields "username", "repo" and a non-empty "query" are required.',
        400
      );
    }

    const repoKey = `${username}/${repo}`;

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
            for await (const chunk of streamWithFallback(prompt)) {
              send({ type: 'chunk', text: chunk });
            }

            const rateLimit = await RateLimiter.increment(clientIP);
            send({
              type: 'done',
              rateLimit,
              usage: {
                estimatedPromptTokens: promptTokens,
                truncated: promptTruncated,
                historyTurns,
                retrieval: retrievalUsed ? { used: true, chunks: chunksUsed } : { used: false },
              },
            });
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

      return new Response(body, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          // Stops proxies buffering the response into one delivery.
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Generate response using Gemini (with fallback to secondary key)
    const response = await generateWithFallback(prompt);

    // Increment rate limit counter after successful response
    const rateLimit = await RateLimiter.increment(clientIP);

    clearTimeout(timeoutId);
    return NextResponse.json({
      success: true,
      response,
      rateLimit,
      usage: {
        estimatedPromptTokens: promptTokens,
        truncated: promptTruncated,
        historyTurns,
        retrieval: retrievalUsed ? { used: true, chunks: chunksUsed } : { used: false },
      },
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
