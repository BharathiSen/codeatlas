import { createHash } from 'node:crypto';

/**
 * Answer-level cache.
 *
 * The repository cache stops us re-ingesting; retrieval stops us over-sending.
 * Neither stops us paying twice for the same question. "What does this repo do?"
 * is the first thing most visitors ask, and every one of them was billed for it.
 *
 * A cached answer is only as fresh as the content it was built from, so this
 * rides the same 6h TTL as the repository cache (D-4) rather than inventing its
 * own staleness window.
 */

/**
 * Reduce a question to what actually distinguishes it.
 *
 * Case, surrounding whitespace, internal run-length and trailing punctuation
 * carry no meaning here — "What does this do?" and "what does this do" are the
 * same question and should not be billed twice. Nothing else is touched:
 * stemming or stop-word removal would start merging questions that differ.
 */
export function normaliseQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.\s]+$/, '');
}

/**
 * Hashed, not embedded: a question can be long, contain anything, and is user
 * input heading for a Redis key. A digest is bounded and injection-proof.
 */
export function answerCacheKey(owner: string, repo: string, query: string): string {
  const digest = createHash('sha256').update(normaliseQuery(query)).digest('hex').slice(0, 32);
  return `answer:v1:${owner}:${repo}:${digest}`;
}

export interface CachedAnswer {
  response: string;
  usage: {
    estimatedPromptTokens: number;
    truncated: boolean;
    historyTurns: number;
    retrieval: { used: boolean; chunks?: number };
  };
}

/**
 * Whether this request's answer is a pure function of (repository, question).
 *
 * Only then is it safe to serve one caller's answer to another:
 *
 * - **A follow-up is not.** With history, the same words mean different things —
 *   "why?" depends entirely on what came before.
 * - **A file-scoped question is not.** It is really (question + which file is
 *   open), and the key does not capture that.
 * - **An empty question is not** worth a cache entry.
 */
export function isCacheableQuestion(options: {
  query: string;
  historyLength: number;
  fileScoped: boolean;
}): boolean {
  return (
    options.historyLength === 0 &&
    !options.fileScoped &&
    normaliseQuery(options.query).length > 0
  );
}
