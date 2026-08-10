import { logger } from '@/lib/logger';
import { estimateTokens } from '@/lib/prompt-generator';

/**
 * Client for the retrieval service.
 *
 * The service itself lives in the Python backend, where tree-sitter and the
 * Qdrant client are first-class. This module is the only thing in the web app
 * that knows retrieval exists — everything above it receives assembled context
 * and cannot tell whether it came from a vector search or the whole repository.
 *
 * Every function degrades: if the backend is unreachable, unindexed, or slow,
 * the caller falls back to the Phase 2 whole-repository path. Retrieval makes
 * answers better; it must never be the reason there is no answer.
 */

const API_URL = process.env.GITINGEST_API_URL || 'http://localhost:8000';

/** Retrieval is an optimisation — do not let it hold up a request. */
const SEARCH_TIMEOUT_MS = Number(process.env.RETRIEVAL_TIMEOUT_MS ?? 20_000);
const INDEX_TIMEOUT_MS = 300_000;

/** How many chunks to request. Trimmed further by the token budget. */
const DEFAULT_LIMIT = Number(process.env.RETRIEVAL_CHUNK_LIMIT ?? 14);

export interface RetrievedChunk {
  path: string;
  symbol: string | null;
  language: string;
  kind: string;
  start_line: number;
  end_line: number;
  text: string;
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  /** False when retrieval was unavailable and the caller should fall back. */
  available: boolean;
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(`Retrieval ${path} returned ${response.status}`, { prefix: 'Retrieval' });
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Retrieval ${path} unavailable: ${message}`, { prefix: 'Retrieval' });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Index a repository. Incremental on the service side — unchanged files are
 * skipped without re-embedding, so this is safe to call on every ingestion.
 */
export async function indexRepository(
  username: string,
  repo: string,
  content: string,
  force = false
): Promise<{ indexed: number; skipped: number } | null> {
  const result = await post<{ success: boolean; data: { indexed: number; skipped: number } }>(
    '/index/',
    { repo: `${username}/${repo}`, content, force },
    INDEX_TIMEOUT_MS
  );

  if (result?.success) {
    logger.info(
      `Indexed ${username}/${repo}: ${result.data.indexed} chunks embedded, ${result.data.skipped} files unchanged`,
      { prefix: 'Retrieval' }
    );
    return result.data;
  }
  return null;
}

/** Hybrid search over an indexed repository. */
export async function retrieve(
  username: string,
  repo: string,
  query: string,
  limit: number = DEFAULT_LIMIT
): Promise<RetrievalResult> {
  const result = await post<{ success: boolean; data: { chunks: RetrievedChunk[] } }>(
    '/search/',
    { repo: `${username}/${repo}`, query, limit },
    SEARCH_TIMEOUT_MS
  );

  if (!result?.success || !result.data?.chunks?.length) {
    return { chunks: [], available: false };
  }

  return { chunks: result.data.chunks, available: true };
}

/**
 * Assemble retrieved chunks into prompt context, newest-relevance first, stopping
 * at the token budget.
 *
 * Chunks arrive ranked, so truncation drops the least relevant rather than an
 * arbitrary tail of the repository — the central improvement over stuffing.
 * Each chunk keeps its path and line range so the model can cite precisely.
 */
export function buildRetrievedContext(
  chunks: RetrievedChunk[],
  budgetTokens: number
): { context: string; used: number; omitted: number } {
  const parts: string[] = [];
  let spent = 0;
  let used = 0;

  for (const chunk of chunks) {
    const header =
      `--- ${chunk.path}` +
      (chunk.symbol ? ` :: ${chunk.symbol}` : '') +
      ` (lines ${chunk.start_line}-${chunk.end_line}) ---`;
    const block = `${header}\n${chunk.text}\n`;
    const cost = estimateTokens(block);

    if (spent + cost > budgetTokens) break;

    parts.push(block);
    spent += cost;
    used += 1;
  }

  return { context: parts.join('\n'), used, omitted: chunks.length - used };
}
