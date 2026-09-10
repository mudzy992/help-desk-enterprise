import { redisConstants } from './redis.constants';
import type { RedisConfiguration } from './redis.types';

function readOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') {
    return undefined;
  }
  return trimmed;
}

function parseRedisPort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return redisConstants.defaults.port;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }
  return port;
}

function normalizeRedisKeyPrefix(value: string): string {
  if (value === '') {
    return value;
  }
  return value.endsWith(':') ? value : `${value}:`;
}

export function loadRedisConfiguration(
  environment: NodeJS.Dict<string> = process.env,
): RedisConfiguration {
  const host = readOptionalValue(
    environment[redisConstants.environmentKeys.host],
  );
  if (host === undefined) {
    throw new Error('REDIS_HOST is required');
  }
  const keyPrefixSource =
    readOptionalValue(environment[redisConstants.environmentKeys.keyPrefix]) ??
    redisConstants.defaults.keyPrefix;
  const queuePrefix =
    readOptionalValue(
      environment[redisConstants.environmentKeys.queuePrefix],
    ) ?? redisConstants.defaults.queuePrefix;
  return {
    host,
    port: parseRedisPort(environment[redisConstants.environmentKeys.port]),
    username: readOptionalValue(
      environment[redisConstants.environmentKeys.username],
    ),
    password: readOptionalValue(
      environment[redisConstants.environmentKeys.password],
    ),
    keyPrefix: normalizeRedisKeyPrefix(keyPrefixSource),
    queuePrefix,
  };
}
