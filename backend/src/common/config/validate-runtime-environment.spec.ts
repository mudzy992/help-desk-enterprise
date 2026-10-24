import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRuntimeEnvironment } from './validate-runtime-environment';

const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const productionEnvironment = {
  NODE_ENV: 'production', DEPLOYMENT_ENV: 'production',
  DATABASE_URL: 'postgresql://app:password@db:5432/helpdesk?sslmode=verify-full',
  DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
  REDIS_HOST: 'redis.internal', REDIS_TLS: 'true', REDIS_CA_CERT_BASE64: Buffer.from('ca').toString('base64'),
  REDIS_SERVERNAME: 'redis.internal', REDIS_USERNAME: 'app', REDIS_PASSWORD: 'not-logged-secret',
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  INBOUND_EMAIL_TOKEN_SECRET: 'inbound-purpose-secret', PRIVACY_TOMBSTONE_KEY: 'tombstone-purpose-secret',
  PRIVACY_EXPORT_KEY: 'export-purpose-secret', CONFIG_PACKAGE_SIGNING_KEY: key,
};

describe('validateRuntimeEnvironment', () => {
  it('does not impose production policy in test/development', () => expect(validateRuntimeEnvironment({ NODE_ENV: 'test' })).toEqual({ NODE_ENV: 'test' }));
  it('accepts a complete production environment', () => expect(validateRuntimeEnvironment({ ...productionEnvironment })).toBeDefined());
  it.each(['INBOUND_EMAIL_TOKEN_SECRET', 'PRIVACY_TOMBSTONE_KEY', 'PRIVACY_EXPORT_KEY'])(
    'rejects missing explicit purpose secret %s without exposing another secret', (name) => {
      const environment = { ...productionEnvironment, [name]: '' };
      expect(() => validateRuntimeEnvironment(environment)).toThrow(`${name} must be explicit`);
      try { validateRuntimeEnvironment(environment); } catch (error) { expect(String(error)).not.toContain('not-logged-secret'); }
    },
  );
  it('rejects plaintext production Redis', () => expect(() => validateRuntimeEnvironment({ ...productionEnvironment, REDIS_TLS: 'false' })).toThrow('REDIS_TLS=true'));
  it('rejects a neutral namespace', () => expect(() => validateRuntimeEnvironment({ ...productionEnvironment, REDIS_KEY_PREFIX: 'servicedesk' })).toThrow('DEPLOYMENT_ENV'));
  it('loads a CA from a mounted secret file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'redis-ca-'));
    const path = join(directory, 'ca.pem'); writeFileSync(path, 'ca');
    expect(validateRuntimeEnvironment({ ...productionEnvironment, REDIS_CA_CERT_BASE64: '', REDIS_CA_CERT_PATH: path })).toBeDefined();
    rmSync(directory, { recursive: true });
  });
});
