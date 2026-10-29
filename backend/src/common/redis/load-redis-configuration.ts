import { readFileSync } from 'node:fs';
import { redisConstants } from './redis.constants';
import type { RedisConfiguration } from './redis.types';

function readOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
function parseRedisPort(value: string | undefined): number {
  if (!value?.trim()) return redisConstants.defaults.port;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('REDIS_PORT must be a valid TCP port');
  return port;
}
function normalizePrefix(value: string): string { return value.endsWith(':') ? value : `${value}:`; }
function readCa(environment: NodeJS.Dict<string>): string | undefined {
  const path = readOptionalValue(environment.REDIS_CA_CERT_PATH);
  const encoded = readOptionalValue(environment.REDIS_CA_CERT_BASE64);
  if (path && encoded) throw new Error('set only one of REDIS_CA_CERT_PATH or REDIS_CA_CERT_BASE64');
  if (path) return readFileSync(path, 'utf8');
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf8');
  return undefined;
}

export function loadRedisConfiguration(environment: NodeJS.Dict<string> = process.env): RedisConfiguration {
  const host = readOptionalValue(environment[redisConstants.environmentKeys.host]);
  if (!host) throw new Error('REDIS_HOST is required');
  const production = environment.NODE_ENV === 'production';
  const tlsEnabled = environment.REDIS_TLS?.trim().toLowerCase() === 'true';
  const deploymentEnvironment = readOptionalValue(environment.DEPLOYMENT_ENV);
  const username = readOptionalValue(environment.REDIS_USERNAME);
  const password = readOptionalValue(environment.REDIS_PASSWORD);
  const ca = readCa(environment);
  const servername = readOptionalValue(environment.REDIS_SERVERNAME) ?? host;
  if (production) {
    if (!tlsEnabled) throw new Error('production Redis requires REDIS_TLS=true (rediss)');
    if (!ca) throw new Error('production Redis requires a trusted CA certificate');
    if (!servername) throw new Error('production Redis requires REDIS_SERVERNAME');
    if (!username || !password) throw new Error('production Redis requires ACL username and password');
    if (!deploymentEnvironment || !/^[a-z0-9][a-z0-9-]{1,30}$/u.test(deploymentEnvironment)) {
      throw new Error('production Redis requires a valid DEPLOYMENT_ENV namespace');
    }
  }
  const requiredPrefix = deploymentEnvironment ? `${deploymentEnvironment}:servicedesk:` : undefined;
  const keyPrefix = normalizePrefix(readOptionalValue(environment.REDIS_KEY_PREFIX) ?? requiredPrefix ?? redisConstants.defaults.keyPrefix);
  const queuePrefix = readOptionalValue(environment.QUEUE_PREFIX) ?? (deploymentEnvironment ? `bull:${deploymentEnvironment}:servicedesk` : redisConstants.defaults.queuePrefix);
  if (production && (!keyPrefix.startsWith(requiredPrefix!) || !queuePrefix.startsWith(`bull:${deploymentEnvironment}:`))) {
    throw new Error('Redis key and queue prefixes must include DEPLOYMENT_ENV');
  }
  return {
    host,
    port: parseRedisPort(environment.REDIS_PORT),
    username,
    password,
    keyPrefix,
    queuePrefix,
    deploymentEnvironment,
    tls: tlsEnabled && ca ? { ca, servername, rejectUnauthorized: true } : undefined,
  };
}
