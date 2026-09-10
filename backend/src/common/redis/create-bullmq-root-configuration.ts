import type {
  BullMqRootConfiguration,
  RedisConfiguration,
} from './redis.types';

export function createBullMqRootConfiguration(
  configuration: RedisConfiguration,
): BullMqRootConfiguration {
  return {
    connection: {
      host: configuration.host,
      port: configuration.port,
      username: configuration.username,
      password: configuration.password,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    },
    prefix: configuration.queuePrefix,
  };
}
