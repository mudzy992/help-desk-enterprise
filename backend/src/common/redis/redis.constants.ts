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
    keyPrefix: 'ephelpdesk',
    queuePrefix: 'bull:ephelpdesk',
  },
} as const;
