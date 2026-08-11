import { NextResponse } from 'next/server';
import { currentRequestId } from './request-context';

/**
 * Machine-readable error codes.
 *
 * Every route returns one of these alongside the human-readable message, so
 * clients can branch on `code` instead of pattern-matching prose. Codes are
 * stable; messages are not.
 */
export const ErrorCode = {
  // Request problems
  INVALID_REQUEST: 'invalid_request',
  MISSING_PARAMETERS: 'missing_parameters',

  // Repository problems
  REPO_NOT_FOUND: 'repo_not_found',
  REPO_PRIVATE: 'repo_private',
  REPO_TOO_LARGE: 'repo_too_large',
  FILE_NOT_FOUND: 'file_not_found',

  // Capacity and quota
  RATE_LIMITED: 'rate_limited',
  QUOTA_UNAVAILABLE: 'quota_unavailable',
  CONTEXT_TOO_LARGE: 'context_too_large',
  UPSTREAM_RATE_LIMITED: 'upstream_rate_limited',

  // Infrastructure
  NOT_CONFIGURED: 'not_configured',
  UPSTREAM_ERROR: 'upstream_error',
  TIMEOUT: 'timeout',
  GENERATION_FAILED: 'generation_failed',
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  success: false;
  code: ErrorCodeValue;
  error: string;
  /** Correlates this response with its server-side log lines. */
  requestId: string;
  /** Optional structured context — never includes secrets. */
  details?: Record<string, unknown>;
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  requestId: string;
}

/**
 * Echoed as a header too, so the id is reachable without parsing the body —
 * which matters for the streaming response, where there is no body to parse
 * until it finishes.
 */
const idHeader = (requestId: string) => ({ 'x-request-id': requestId });

/** Success envelope. Extra top-level fields (e.g. `cached`) may be merged in. */
export function apiSuccess<T>(data: T, extra?: Record<string, unknown>) {
  const requestId = currentRequestId() ?? crypto.randomUUID();
  return NextResponse.json(
    { success: true, data, ...extra, requestId },
    { headers: idHeader(requestId) }
  );
}

/** Error envelope with a stable code and an HTTP status. */
export function apiError(
  code: ErrorCodeValue,
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  const requestId = currentRequestId() ?? crypto.randomUUID();
  const body: ApiErrorBody = { success: false, code, error: message, requestId };
  if (details) body.details = details;
  return NextResponse.json(body, { status, headers: idHeader(requestId) });
}


/**
 * GitHub owner and repository names are restricted to these characters.
 *
 * Both values are interpolated into an outbound URL, so validating them here
 * keeps path traversal and userinfo tricks (`a@evil.com`) out of the request
 * before it is built, rather than relying on the receiver to notice.
 */
const REPO_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

export function isValidRepoSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    REPO_SEGMENT.test(value) &&
    value !== "." &&
    value !== ".."
  );
}
