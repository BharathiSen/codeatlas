import { NextResponse } from "next/server";
import { RateLimiter } from "@/lib/rate-limiter";
import { getQuotaSubject } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { apiError, ErrorCode } from "@/lib/api-response";
import { withRequestId } from '@/lib/request-context';

async function handleGet(req: Request) {
  try {
    const quotaSubject = await getQuotaSubject(req);
    const rateLimit = await RateLimiter.check(quotaSubject);

    return NextResponse.json({ success: true, data: rateLimit });
  } catch (error) {
    logger.error(
      `Error checking rate limit: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { prefix: 'RateLimit' }
    );
    return apiError(
      ErrorCode.QUOTA_UNAVAILABLE,
      'Failed to check rate limit.',
      503
    );
  }
}

/*
 * Wrapped so `apiSuccess` / `apiError` / `logger` all reach the same request
 * id without it being threaded through every call site.
 */
export const GET = withRequestId(handleGet);
