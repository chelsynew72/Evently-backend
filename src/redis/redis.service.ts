import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Thin cache wrapper around ioredis. Every method fails soft — if Redis is
 * unreachable, cache reads return null (treated as a cache miss) and
 * writes are silently skipped, so a Redis outage degrades performance
 * instead of taking the whole API down.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection error (caching disabled until reconnect): ${err.message}`);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Redis GET failed for key "${key}": ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis SET failed for key "${key}": ${(err as Error).message}`);
    }
  }
  

  async del(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Redis DEL failed for pattern "${pattern}": ${(err as Error).message}`);
    }
  }

  getClient(): Redis {
    return this.client;
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
