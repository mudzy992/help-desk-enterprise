import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { createBullMqRootConfiguration } from './create-bullmq-root-configuration';
import { createRedisClient } from './create-redis-client';
import { loadRedisConfiguration } from './load-redis-configuration';
import { RedisService } from './redis.service';
import { redisTokens } from './redis.tokens';

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
      useFactory: createRedisClient,
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
