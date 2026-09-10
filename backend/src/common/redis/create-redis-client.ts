import Redis from 'ioredis';
import type { RedisConfiguration } from './redis.types';

export function createRedisClient(configuration: RedisConfiguration): Redis {
  return new Redis({
    host: configuration.host,
    port: configuration.port,
    username: configuration.username,
    password: configuration.password,
    keyPrefix: configuration.keyPrefix,
    lazyConnect: true,
  });
}
