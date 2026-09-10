import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { closeRedisClient } from './close-redis-client';
import { redisTokens } from './redis.tokens';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(redisTokens.client) private readonly client: Redis) {}

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await closeRedisClient(this.client);
  }
}
