import { Redis } from 'ioredis';
import { logger } from './logger';

const CACHE_DURATION = 6 * 60 * 60; // 6 hours in seconds

export class RedisCacheManager {
  private static redis: Redis;

  private static async getClient() {
    if (!this.redis) {
      const redisUrl = process.env.REDIS_URL; // Use the full URL from .env
      if (!redisUrl) {
        throw new Error('REDIS_URL environment variable not configured');
      }

      // Non-TLS. Same fail-fast posture as the quota client: a cache read
      // that hangs delays an answer that could have been served without it.
      this.redis = new Redis(redisUrl, {
      /*
       * Fail fast rather than hang.
       *
       * ioredis defaults to 20 retries plus an offline queue, so with Redis
       * down a single command took ~10s to reject and an answering request
       * ~35s before it could return its 503 — measured. The quota's posture is
       * to refuse when it cannot be read, and a refusal is only useful if it
       * arrives promptly; a caller waiting half a minute for "try again" is a
       * worse outage than the one being reported.
       */
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });

      this.redis.on('connect', () => {
        logger.info('Redis connected successfully', { prefix: 'Cache' });
      });

      this.redis.on('error', (error) => {
        logger.error(`Redis connection error: ${error}`, { prefix: 'Cache' });
      });
    }

    return this.redis;
  }

  private static getCacheKey(username: string, repo: string): string {
    return `repo_data:${username}:${repo}`;
  }

  static async hasCache(username: string, repo: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const key = this.getCacheKey(username, repo);
      const exists = await client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error(`Cache check error: ${error}`, { prefix: 'Cache' });
      return false;
    }
  }

  static async saveToCache(username: string, repo: string, data: any): Promise<void> {
    try {
      const client = await this.getClient();
      const key = this.getCacheKey(username, repo);
      await client.setex(key, CACHE_DURATION, JSON.stringify(data));
      logger.info(`Cached data for ${username}/${repo}`, { prefix: 'Cache' });
    } catch (error) {
      logger.error(`Cache save error: ${error}`, { prefix: 'Cache' });
    }
  }

  static async getFromCache(username: string, repo: string): Promise<any> {
    try {
      const client = await this.getClient();
      const key = this.getCacheKey(username, repo);
      const data = await client.get(key);
      if (!data) return null;

      return JSON.parse(data);
    } catch (error) {
      logger.error(`Cache retrieval error: ${error}`, { prefix: 'Cache' });
      return null;
    }
  }

  /**
   * Read an arbitrary cached string.
   *
   * Used for rendered insight documents, which are markdown rather than the
   * `{tree, content}` shape the repository cache stores.
   */
  static async getRaw(key: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      return await client.get(key);
    } catch (error) {
      logger.error(`Cache retrieval error for ${key}: ${error}`, { prefix: 'Cache' });
      return null;
    }
  }

  /** Write an arbitrary string under the shared repository TTL. */
  static async saveRaw(key: string, value: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.setex(key, CACHE_DURATION, value);
      logger.info(`Cached ${key}`, { prefix: 'Cache' });
    } catch (error) {
      logger.error(`Cache save error for ${key}: ${error}`, { prefix: 'Cache' });
    }
  }

  static async clearCache(username: string, repo: string): Promise<void> {
    try {
      const client = await this.getClient();
      const key = this.getCacheKey(username, repo);
      await client.del(key);
      logger.info(`Cleared cache for ${username}/${repo}`, { prefix: 'Cache' });
    } catch (error) {
      logger.error(`Cache clear error: ${error}`, { prefix: 'Cache' });
    }
  }
}
