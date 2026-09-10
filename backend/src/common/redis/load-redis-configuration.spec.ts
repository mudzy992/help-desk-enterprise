import { loadRedisConfiguration } from './load-redis-configuration';

describe('loadRedisConfiguration', () => {
  const validEnvironment = {
    REDIS_HOST: 'redis-core',
    REDIS_PORT: '6379',
    REDIS_USERNAME: 'ephelpdesk',
    REDIS_PASSWORD: 'change-me',
    REDIS_KEY_PREFIX: 'ephelpdesk',
    QUEUE_PREFIX: 'bull:ephelpdesk',
  };

  it('loads typed configuration from existing Coolify env keys', () => {
    expect(loadRedisConfiguration(validEnvironment)).toEqual({
      host: 'redis-core',
      port: 6379,
      username: 'ephelpdesk',
      password: 'change-me',
      keyPrefix: 'ephelpdesk:',
      queuePrefix: 'bull:ephelpdesk',
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
      keyPrefix: 'ephelpdesk:',
      queuePrefix: 'bull:ephelpdesk',
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
      REDIS_KEY_PREFIX: 'ephelpdesk:',
    });
    expect(configuration.keyPrefix).toBe('ephelpdesk:');
  });
});
