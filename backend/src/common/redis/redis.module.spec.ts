import { Test } from '@nestjs/testing';
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';
import { redisTokens } from './redis.tokens';
import type { RedisConfiguration } from './redis.types';

describe('RedisModule', () => {
  beforeEach(() => {
    process.env.REDIS_HOST = 'redis-core';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_USERNAME = 'servicedesk';
    process.env.REDIS_PASSWORD = 'test-password';
    process.env.REDIS_KEY_PREFIX = 'servicedesk';
    process.env.QUEUE_PREFIX = 'bull:servicedesk';
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
    expect(configuration.queuePrefix).toBe('bull:servicedesk');
    expect(redisService.getClient().status).toBe('wait');
    // Val 3: the shared client must own an `error` listener, otherwise every
    // failed reconnect is an "[ioredis] Unhandled error event" print instead of
    // a log line (and, for duplicated clients, a process-killing rejection).
    expect(redisService.getClient().listenerCount('error')).toBeGreaterThan(0);
    await moduleRef.close();
    expect(redisService.getClient().status).toBe('end');
  });
});
