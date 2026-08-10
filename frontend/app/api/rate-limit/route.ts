import { NextResponse } from "next/server";
import { getClientIP, RateLimiter } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { apiError, ErrorCode } from "@/lib/api-response";

export async function GET(req: Request) {
  try {
    const clientIP = getClientIP(req);
    const rateLimit = await RateLimiter.check(clientIP);

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
