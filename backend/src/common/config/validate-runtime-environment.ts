import { assertDatabaseTransport } from '../database/database-runtime-contract';
import { loadRedisConfiguration } from '../redis/load-redis-configuration';
import { readMfaEncryptionKey } from '../../modules/authentication/security/mfa-secret-cipher';
import { readExplicitSecret } from '../security/read-explicit-secret';

const requiredExplicitSecrets = [
  'INBOUND_EMAIL_TOKEN_SECRET',
  'PRIVACY_TOMBSTONE_KEY',
  'PRIVACY_EXPORT_KEY',
] as const;

function assertHttpsUrl(environment: NodeJS.Dict<string>, key: string): void {
  const raw = environment[key]?.trim();
  if (!raw) return;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${key} must be a valid URL`); }
  if (url.protocol !== 'https:') throw new Error(`${key} must use https in production`);
}

export function validateRuntimeEnvironment<T extends NodeJS.Dict<string>>(environment: T): T {
  if (environment.NODE_ENV !== 'production') return environment;
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  try {
    assertDatabaseTransport(databaseUrl, environment);
  } catch {
    throw new Error('DATABASE_URL is invalid or does not meet the production TLS contract');
  }
  loadRedisConfiguration(environment);

  if (readMfaEncryptionKey(environment.MFA_ENCRYPTION_KEY) === null) {
    throw new Error('MFA_ENCRYPTION_KEY must be base64 for exactly 32 bytes');
  }
  for (const key of requiredExplicitSecrets) {
    if (readExplicitSecret(environment[key]) === null) {
      throw new Error(`${key} must be explicit in production; MFA-derived fallback is forbidden`);
    }
  }
  if ((environment.CONFIG_PACKAGE_SIGNING_KEY?.trim().length ?? 0) < 32) {
    throw new Error('CONFIG_PACKAGE_SIGNING_KEY must contain at least 32 characters');
  }
  for (const key of ['APP_PUBLIC_URL', 'API_PUBLIC_URL', 'OPS_ALERT_TEAMS_WEBHOOK_URL', 'OPS_UPTIME_PUSH_URL']) {
    assertHttpsUrl(environment, key);
  }
  return environment;
}
