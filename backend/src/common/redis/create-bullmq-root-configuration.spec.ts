import { createBullMqRootConfiguration } from './create-bullmq-root-configuration';
import type { RedisConfiguration } from './redis.types';

describe('createBullMqRootConfiguration', () => {
  const configuration: RedisConfiguration = {
    host: 'redis-core',
    port: 6379,
    username: 'ephelpdesk',
    password: 'change-me',
    keyPrefix: 'ephelpdesk:',
    queuePrefix: 'bull:ephelpdesk',
  };

  it('builds BullMQ connection options without sharing the app key prefix', () => {
    expect(createBullMqRootConfiguration(configuration)).toEqual({
      connection: {
        host: 'redis-core',
        port: 6379,
        username: 'ephelpdesk',
        password: 'change-me',
        maxRetriesPerRequest: null,
        lazyConnect: true,
      },
      prefix: 'bull:ephelpdesk',
    });
  });
});
