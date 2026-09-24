import type { PrincipalContextCacheClient } from '../principal-context/principal-context.cache';

/**
 * In-memory stand-in for the Redis client (phase 2.2). Used by module-graph
 * specs that exercise the real DI graph but must not talk to a real Redis.
 *
 * It answers the two calls the request path makes (`get`, `set`, `del`) and
 * reports `ready`, so the loaders never try to open a connection.
 */
export function createFakeRedisClient(): PrincipalContextCacheClient & {
  readonly status: string;
  connect(): Promise<void>;
  quit(): Promise<string>;
  disconnect(): void;
} {
  const entries = new Map<string, string>();
  return {
    status: 'ready',
    connect: async () => undefined,
    get: async (key: string) => entries.get(key) ?? null,
    set: async (
      key: string,
      value: string,
      _mode: 'EX',
      _ttlSeconds: number,
      notExists?: 'NX',
    ) => {
      if (notExists === 'NX' && entries.has(key)) {
        return null;
      }
      entries.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (entries.delete(key) ? 1 : 0),
    // `RedisService.onModuleDestroy` closes the client when the module graph is
    // torn down; the fake answers both closing calls.
    quit: async () => 'OK',
    disconnect: () => undefined,
  };
}
