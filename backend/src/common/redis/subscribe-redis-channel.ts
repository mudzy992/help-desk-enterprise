import type Redis from 'ioredis';
import { closeRedisClient } from './close-redis-client';

/**
 * Val 3 (nalaz iz incidenta 2026-10-04): the API died on startup with
 * `WRONGPASS`/`Connection is closed.` from a duplicated Redis client, while
 * `ops/runbook/redis-down.md` promises the opposite — "every path has a fail-open
 * branch, the application stays up". Two things were missing from the two
 * subscribers that duplicate the shared client and call `subscribe()` in
 * `onModuleInit`:
 *
 * 1. an `error` listener (ioredis otherwise prints "Unhandled error event"), and
 * 2. a `try`/`catch` around connect/subscribe — a rejected promise inside
 *    `onModuleInit` aborts Nest's boot, so the process exits and restarts in a
 *    loop until the credentials are fixed.
 *
 * This helper owns both, plus one more thing the incident made obvious: the
 * subscription is *retried* until it succeeds (default every 30 s). Fixing the
 * Redis ACL is then enough — the bridge comes back on its own, without a redeploy.
 * Until it does, the caller simply has no bridge (fail-open), exactly like a
 * Redis that is down.
 */
export const redisChannelRetryDelayMs = 30_000;

export type RedisChannelLogger = {
  readonly warn: (message: string) => void;
  readonly log?: (message: string) => void;
};

export type RedisChannelSubscription = {
  close(): Promise<void>;
};

export async function subscribeRedisChannel(options: {
  readonly source: Redis;
  readonly channel: string;
  readonly label: string;
  readonly logger: RedisChannelLogger;
  readonly onMessage: (channel: string, message: string) => void;
  readonly retryDelayMs?: number;
}): Promise<RedisChannelSubscription> {
  const retryDelayMs = options.retryDelayMs ?? redisChannelRetryDelayMs;
  let subscriber: Redis;
  try {
    subscriber = options.source.duplicate();
  } catch (error) {
    options.logger.warn(
      `${options.label}_redis_unavailable reason=${describeError(error)}`,
    );
    return { close: async () => undefined };
  }
  // First, before anything can fail: without this listener ioredis logs
  // "[ioredis] Unhandled error event" for every failed reconnect attempt.
  subscriber.on('error', (error: Error) => {
    options.logger.warn(`${options.label}_redis_error reason=${error.message}`);
  });
  subscriber.on('message', (channel: string, message: string) => {
    if (channel === options.channel) {
      options.onMessage(channel, message);
    }
  });

  let closed = false;
  let subscribed = false;
  let retryTimer: NodeJS.Timeout | null = null;

  const attempt = async (): Promise<void> => {
    if (closed || subscribed) {
      return;
    }
    try {
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      }
      await subscriber.subscribe(options.channel);
      subscribed = true;
      options.logger.log?.(
        `${options.label}_redis_subscribed channel=${options.channel}`,
      );
    } catch (error) {
      options.logger.warn(
        `${options.label}_redis_subscribe_skipped channel=${options.channel} reason=${describeError(error)}`,
      );
      if (!closed) {
        retryTimer = setTimeout(() => {
          void attempt();
        }, retryDelayMs);
        retryTimer.unref?.();
      }
    }
  };

  await attempt();

  return {
    close: async () => {
      closed = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      await closeRedisClient(subscriber);
    },
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
