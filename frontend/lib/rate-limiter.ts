import { Redis } from 'ioredis';
import { logger } from './logger';

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);
const WINDOW_SECONDS = 24 * 60 * 60; // 24 hours in seconds

/**
 * What to do when Redis is unreachable.
 *
 * Default is **fail closed**: a quota we cannot read is a quota we cannot
 * enforce, and an unenforced quota on a paid API is unbounded spend. Operators
 * who would rather stay available than protected can set
 * `RATE_LIMIT_FAIL_OPEN=true`. See notebook §15 D-15.
 */
const FAIL_OPEN = process.env.RATE_LIMIT_FAIL_OPEN === 'true';

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // Unix timestamp when limit resets
  /** True when the limiter could not reach Redis and applied its fallback posture. */
  degraded?: boolean;
}

/**
 * Resolve the caller's IP from proxy headers.
 *
 * Shared by every route that consults the rate limiter so the quota key is
 * derived identically everywhere. Note that these headers are only trustworthy
 * behind a proxy that sets them; see the notebook's known limitations.
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

export class RateLimiter {
  private static redis: Redis;

  private static async getClient(): Promise<Redis> {
    if (!this.redis) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL environment variable not configured');
      }

      this.redis = new Redis(redisUrl);

      this.redis.on('error', (error) => {
        logger.error(`Redis rate limiter error: ${error}`, { prefix: 'RateLimit' });
      });
    }

    return this.redis;
  }

  /**
   * v2 keys hold a plain integer so INCR can be used atomically. The previous
   * scheme stored JSON and required a read-modify-write, which lost increments
   * under concurrent requests from the same IP.
   */
  private static getKey(ip: string): string {
    return `ratelimit:v2:${ip}`;
  }

  /** Shape returned when Redis is unavailable, per the configured posture. */
  private static degraded(): RateLimitInfo {
    return {
      allowed: FAIL_OPEN,
      remaining: FAIL_OPEN ? DAILY_LIMIT : 0,
      limit: DAILY_LIMIT,
      resetAt: Math.floor(Date.now() / 1000) + WINDOW_SECONDS,
      degraded: true,
    };
  }

  /** Read the caller's quota without consuming any of it. */
  static async check(ip: string): Promise<RateLimitInfo> {
    try {
      const client = await this.getClient();
      const key = this.getKey(ip);

      const [rawCount, ttl] = await Promise.all([client.get(key), client.ttl(key)]);
      const count = rawCount ? Number(rawCount) : 0;
      const secondsLeft = ttl > 0 ? ttl : WINDOW_SECONDS;

      return {
        allowed: count < DAILY_LIMIT,
        remaining: Math.max(0, DAILY_LIMIT - count),
        limit: DAILY_LIMIT,
        resetAt: Math.floor(Date.now() / 1000) + secondsLeft,
      };
    } catch (error) {
      logger.error(`Rate limit check error: ${error}`, { prefix: 'RateLimit' });
      return this.degraded();
    }
  }

  /**
   * Consume one request from the caller's quota.
   *
   * INCR is atomic, so concurrent requests from one IP cannot both read the same
   * count and overwrite each other. The window TTL is attached only on the first
   * increment, which makes the window fixed rather than sliding.
   */
  static async increment(ip: string): Promise<RateLimitInfo> {
    try {
      const client = await this.getClient();
      const key = this.getKey(ip);

      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, WINDOW_SECONDS);
      }

      const ttl = await client.ttl(key);
      const secondsLeft = ttl > 0 ? ttl : WINDOW_SECONDS;

      logger.info(`Rate limit for ${ip}: ${count}/${DAILY_LIMIT} used`, { prefix: 'RateLimit' });

      return {
        allowed: count <= DAILY_LIMIT,
        remaining: Math.max(0, DAILY_LIMIT - count),
        limit: DAILY_LIMIT,
        resetAt: Math.floor(Date.now() / 1000) + secondsLeft,
      };
    } catch (error) {
      logger.error(`Rate limit increment error: ${error}`, { prefix: 'RateLimit' });
      return this.degraded();
    }
  }
}
