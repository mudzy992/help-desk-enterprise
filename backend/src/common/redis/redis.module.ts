import { Global, Logger, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { createBullMqRootConfiguration } from './create-bullmq-root-configuration';
import { createRedisClient } from './create-redis-client';
import { loadRedisConfiguration } from './load-redis-configuration';
import { RedisService } from './redis.service';
import { redisTokens } from './redis.tokens';
import type { RedisConfiguration } from './redis.types';

const redisClientLogger = new Logger('RedisClient');

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () =>
        createBullMqRootConfiguration(loadRedisConfiguration()),
    }),
  ],
  providers: [
    {
      provide: redisTokens.configuration,
      useFactory: loadRedisConfiguration,
    },
    {
      provide: redisTokens.client,
      // Val 3: without this listener ioredis prints "[ioredis] Unhandled error
      // event" for every failed reconnect (seen live during the 2026-10-04
      // WRONGPASS incident). The listener does not swallow the failure — it turns
      // it into one log line an operator can read, and keeps the client alive.
      useFactory: (configuration: RedisConfiguration) => {
        const client = createRedisClient(configuration);
        client.on('error', (error: Error) => {
          redisClientLogger.warn(`redis_client_error reason=${error.message}`);
        });
        return client;
      },
      inject: [redisTokens.configuration],
    },
    RedisService,
  ],
  exports: [
    BullModule,
    redisTokens.configuration,
    redisTokens.client,
    RedisService,
  ],
})
export class RedisModule {}
