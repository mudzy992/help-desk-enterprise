import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../../common/redis/redis.tokens';
import { bulkBroadcastRateLimiter } from './bulk-broadcast-rate-limiter';

/**
 * Val 3 (M8/B2): the bulk functions are pure modules, so the limiter they call is
 * a module-level singleton. This provider hands it the shared Redis client once,
 * when the tickets module boots; without it (unit tests, Redis-less wiring) the
 * limiter keeps enforcing in memory.
 */
@Injectable()
export class BulkBroadcastRateLimiterBootstrap {
  constructor(@Inject(redisTokens.client) redis: Redis) {
    bulkBroadcastRateLimiter.attachRedis(redis);
  }
}
