import { NextResponse } from "next/server";
import { getClientIP, RateLimiter } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

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
    return NextResponse.json(
      { success: false, error: 'Failed to check rate limit' },
      { status: 500 }
    );
  }
}
