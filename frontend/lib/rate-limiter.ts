import { Redis } from 'ioredis';
import { logger } from './logger';

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);

/**
 * Budget for a signed-in user.
 *
 * Higher than the anonymous limit because the subject is now a real account
 * rather than a shared, spoofable address: the quota is attributable, so it can
 * be more generous without being easier to abuse.
 */
const USER_DAILY_LIMIT = Number(process.env.AI_USER_DAILY_LIMIT ?? 100);
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
 * Number of proxies between the client and this app.
 *
 * `x-forwarded-for` is a client-controllable list — anyone can send
 * `X-Forwarded-For: 1.2.3.4` and mint themselves a fresh quota. Only the hops
 * *appended by infrastructure you control* are trustworthy, so the real client
 * is counted from the right-hand end, not taken from the left.
 *
 * 0 (the default) means no trusted proxy: the header is ignored entirely and
 * every caller shares one bucket, which fails safe. Set it to 1 behind a single
 * reverse proxy, Vercel or Cloudflare.
 */
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);

/**
 * Resolve the caller's address.
 *
 * Only the anonymous quota bucket is derived from this — a signed-in caller is
 * keyed on their account instead. Routes should call `getQuotaSubject()` in
 * `lib/auth.ts` rather than this directly, so the two never disagree.
 */
export function getClientIP(req: Request): string {
  if (TRUSTED_PROXY_HOPS > 0) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
      // The last entry was appended by the nearest proxy; step back one hop per
      // trusted proxy to reach the address that proxy actually observed.
      const candidate = hops[hops.length - TRUSTED_PROXY_HOPS];
      if (candidate) return candidate;
    }

    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp;
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
  private static getKey(subject: string): string {
    return `ratelimit:v2:${subject}`;
  }

  /** A signed-in subject is namespaced `user:`; everything else is anonymous. */
  private static limitFor(subject: string): number {
    return subject.startsWith('user:') ? USER_DAILY_LIMIT : DAILY_LIMIT;
  }

  /** Shape returned when Redis is unavailable, per the configured posture. */
  private static degraded(subject = ''): RateLimitInfo {
    const limit = this.limitFor(subject);
    return {
      allowed: FAIL_OPEN,
      remaining: FAIL_OPEN ? limit : 0,
      limit,
      resetAt: Math.floor(Date.now() / 1000) + WINDOW_SECONDS,
      degraded: true,
    };
  }

  /** Read the caller's quota without consuming any of it. */
  static async check(subject: string): Promise<RateLimitInfo> {
    const limit = this.limitFor(subject);
    try {
      const client = await this.getClient();
      const key = this.getKey(subject);

      const [rawCount, ttl] = await Promise.all([client.get(key), client.ttl(key)]);
      const count = rawCount ? Number(rawCount) : 0;
      const secondsLeft = ttl > 0 ? ttl : WINDOW_SECONDS;

      return {
        allowed: count < limit,
        remaining: Math.max(0, limit - count),
        limit,
        resetAt: Math.floor(Date.now() / 1000) + secondsLeft,
      };
    } catch (error) {
      logger.error(`Rate limit check error: ${error}`, { prefix: 'RateLimit' });
      return this.degraded(subject);
    }
  }

  /**
   * Consume one request from the caller's quota.
   *
   * INCR is atomic, so concurrent requests from one subject cannot both read the
   * same count and overwrite each other. The window TTL is attached only on the first
   * increment, which makes the window fixed rather than sliding.
   */
  static async increment(subject: string): Promise<RateLimitInfo> {
    const limit = this.limitFor(subject);
    try {
      const client = await this.getClient();
      const key = this.getKey(subject);

      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, WINDOW_SECONDS);
      }

      const ttl = await client.ttl(key);
      const secondsLeft = ttl > 0 ? ttl : WINDOW_SECONDS;

      logger.info(`Rate limit for ${subject}: ${count}/${limit} used`, { prefix: 'RateLimit' });

      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        limit,
        resetAt: Math.floor(Date.now() / 1000) + secondsLeft,
      };
    } catch (error) {
      logger.error(`Rate limit increment error: ${error}`, { prefix: 'RateLimit' });
      return this.degraded(subject);
    }
  }
}
