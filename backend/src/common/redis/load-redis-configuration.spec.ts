import { loadRedisConfiguration } from './load-redis-configuration';

describe('loadRedisConfiguration', () => {
  const validEnvironment = {
    REDIS_HOST: 'redis-core',
    REDIS_PORT: '6379',
    REDIS_USERNAME: 'servicedesk',
    REDIS_PASSWORD: 'change-me',
    REDIS_KEY_PREFIX: 'servicedesk',
    QUEUE_PREFIX: 'bull:servicedesk',
  };

  it('loads typed configuration from existing Coolify env keys', () => {
    expect(loadRedisConfiguration(validEnvironment)).toEqual({
      host: 'redis-core',
      port: 6379,
      username: 'servicedesk',
      password: 'change-me',
      keyPrefix: 'servicedesk:',
      queuePrefix: 'bull:servicedesk',
    });
  });

  it('requires REDIS_HOST', () => {
    expect(() => loadRedisConfiguration({})).toThrow('REDIS_HOST is required');
  });

  it('rejects an invalid REDIS_PORT', () => {
    expect(() =>
      loadRedisConfiguration({
        ...validEnvironment,
        REDIS_PORT: 'not-a-port',
      }),
    ).toThrow('REDIS_PORT must be a valid TCP port');
  });

  it('applies documented defaults when optional keys are omitted', () => {
    expect(loadRedisConfiguration({ REDIS_HOST: 'redis-core' })).toEqual({
      host: 'redis-core',
      port: 6379,
      username: undefined,
      password: undefined,
      keyPrefix: 'servicedesk:',
      queuePrefix: 'bull:servicedesk',
    });
  });

  it('does not treat an empty password as a value', () => {
    const configuration = loadRedisConfiguration({
      REDIS_HOST: 'redis-core',
      REDIS_PASSWORD: '   ',
    });
    expect(configuration.password).toBeUndefined();
  });

  it('keeps an explicit trailing colon on REDIS_KEY_PREFIX', () => {
    const configuration = loadRedisConfiguration({
      REDIS_HOST: 'redis-core',
      REDIS_KEY_PREFIX: 'servicedesk:',
    });
    expect(configuration.keyPrefix).toBe('servicedesk:');
  });

  const secureProduction = {
    NODE_ENV: 'production', DEPLOYMENT_ENV: 'production', REDIS_HOST: 'redis.internal',
    REDIS_TLS: 'true', REDIS_CA_CERT_BASE64: Buffer.from('trusted-ca').toString('base64'),
    REDIS_SERVERNAME: 'redis.internal', REDIS_USERNAME: 'app', REDIS_PASSWORD: 'secret',
  };

  it('builds verified TLS and environment-scoped production prefixes', () => {
    expect(loadRedisConfiguration(secureProduction)).toMatchObject({
      keyPrefix: 'production:servicedesk:', queuePrefix: 'bull:production:servicedesk',
      tls: { ca: 'trusted-ca', servername: 'redis.internal', rejectUnauthorized: true },
    });
  });

  it.each([
    ['plaintext', { REDIS_TLS: 'false' }, 'REDIS_TLS=true'],
    ['missing CA', { REDIS_CA_CERT_BASE64: '' }, 'trusted CA'],
    ['missing auth', { REDIS_PASSWORD: '' }, 'username and password'],
    ['missing namespace', { DEPLOYMENT_ENV: '' }, 'DEPLOYMENT_ENV'],
    ['neutral prefix', { REDIS_KEY_PREFIX: 'servicedesk' }, 'DEPLOYMENT_ENV'],
  ])('rejects insecure production Redis: %s', (_case, override, message) => {
    expect(() => loadRedisConfiguration({ ...secureProduction, ...override })).toThrow(message);
  });

  it('derives non-colliding staging and production namespaces', () => {
    const production = loadRedisConfiguration(secureProduction);
    const staging = loadRedisConfiguration({ ...secureProduction, DEPLOYMENT_ENV: 'staging' });
    expect(production.keyPrefix).not.toBe(staging.keyPrefix);
    expect(production.queuePrefix).not.toBe(staging.queuePrefix);
  });
});
