import { Test } from '@nestjs/testing';
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';
import { redisTokens } from './redis.tokens';
import type { RedisConfiguration } from './redis.types';

describe('RedisModule', () => {
  beforeEach(() => {
    process.env.REDIS_HOST = 'redis-core';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_USERNAME = 'ephelpdesk';
    process.env.REDIS_PASSWORD = 'test-password';
    process.env.REDIS_KEY_PREFIX = 'ephelpdesk';
    process.env.QUEUE_PREFIX = 'bull:ephelpdesk';
  });

  it('initializes Redis and BullMQ infrastructure without opening a TCP session', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule],
    }).compile();
    const configuration = moduleRef.get<RedisConfiguration>(
      redisTokens.configuration,
    );
    const redisService = moduleRef.get(RedisService);
    expect(configuration.host).toBe('redis-core');
    expect(configuration.queuePrefix).toBe('bull:ephelpdesk');
    expect(redisService.getClient().status).toBe('wait');
    await moduleRef.close();
    expect(redisService.getClient().status).toBe('end');
  });
});
