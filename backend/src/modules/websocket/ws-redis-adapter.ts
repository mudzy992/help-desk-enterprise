import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import type { RedisConfiguration } from '../../common/redis/redis.types';

/** The slice of `Logger` this module needs (keeps the unit test logger-free). */
export type WebsocketAdapterLogger = {
  readonly warn: (message: string) => void;
  readonly log: (message: string) => void;
};

export type WebsocketRedisAdapterHandle = {
  readonly adapter: ReturnType<typeof createAdapter>;
  readonly publishClient: Redis;
  readonly subscribeClient: Redis;
  close(): Promise<void>;
};

/**
 * Phase 3.1 (plan §3.1): the Socket.IO Redis adapter, so two API instances share
 * one set of rooms instead of each serving a private universe.
 *
 * Three rules the plan calls out:
 * 1. **Dedicated connections.** The subscriber connection cannot run normal
 *    commands, and BullMQ already owns its own connections — so this creates two
 *    fresh clients through the existing factory (`create-redis-client.ts`), with
 *    the same credentials and key prefix as everything else.
 * 2. **Never block the boot.** If the clients cannot even be constructed the
 *    gateway keeps the in-memory adapter (degraded, single instance) and logs why.
 *    Connection failures after that are ioredis' own retry loop: the adapter comes
 *    back on its own once Redis is reachable again.
 * 3. **No unhandled errors.** ioredis emits `error` on connection loss; without a
 *    listener that is an uncaught exception. Both clients get a listener here.
 */
export function createWebsocketRedisAdapter(
  configuration: RedisConfiguration,
  logger: WebsocketAdapterLogger,
): WebsocketRedisAdapterHandle | null {
  try {
    const publishClient = createRedisClient(configuration);
    const subscribeClient = createRedisClient(configuration);
    attachConnectionErrorLogging(publishClient, logger);
    attachConnectionErrorLogging(subscribeClient, logger);
    return {
      adapter: createAdapter(publishClient, subscribeClient),
      publishClient,
      subscribeClient,
      close: async () => {
        await Promise.all([
          closeRedisClient(publishClient),
          closeRedisClient(subscribeClient),
        ]);
      },
    };
  } catch (error) {
    logger.warn(
      `ws_adapter_redis_unavailable reason=${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/** One line per state change, same shape as the other `ws_*` metrics from Faza 0. */
export function formatWebsocketAdapterStatus(active: boolean): string {
  return `ws_adapter_redis_ok=${active ? 1 : 0}`;
}

function attachConnectionErrorLogging(
  client: Redis,
  logger: WebsocketAdapterLogger,
): void {
  client.on('error', (error: Error) => {
    logger.warn(`ws_adapter_redis_error reason=${error.message}`);
  });
}
