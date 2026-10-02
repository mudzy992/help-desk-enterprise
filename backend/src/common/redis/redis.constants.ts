export const redisConstants = {
  environmentKeys: {
    host: 'REDIS_HOST',
    port: 'REDIS_PORT',
    username: 'REDIS_USERNAME',
    password: 'REDIS_PASSWORD',
    keyPrefix: 'REDIS_KEY_PREFIX',
    queuePrefix: 'QUEUE_PREFIX',
  },
  defaults: {
    port: 6379,
    // Paket 4.1: neutral defaults. Existing installations set REDIS_KEY_PREFIX /
    // QUEUE_PREFIX explicitly (verified on staging), so they keep their keys.
    keyPrefix: 'servicedesk',
    queuePrefix: 'bull:servicedesk',
  },
} as const;
