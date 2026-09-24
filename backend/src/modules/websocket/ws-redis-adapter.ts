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
 * The channels `@socket.io/redis-adapter` touches, spelled out so the Redis ACL
 * can be written and checked before the adapter runs.
 *
 * They mirror the package (`opts.key || "socket.io"` plus the namespace name,
 * here the root namespace `/`):
 *   channel          → `socket.io#/#<room>#`   (PUBLISH, per room)
 *   requestChannel   → `socket.io-request#/#`  (PUBLISH + SUBSCRIBE)
 *   responseChannel  → `socket.io-response#/#<uid>#` (PUBLISH + SUBSCRIBE)
 * and the adapter subscribes with `PSUBSCRIBE socket.io#/#*`.
 *
 * Redis ACL treats the two kinds of subscription differently: `PUBLISH` and
 * `SUBSCRIBE` are matched against the allowed globs, but **`PSUBSCRIBE` needs a
 * literal match** — `&socket.io#*` does not cover `socket.io#/#*`. That is why
 * the pattern below is its own constant: it is the exact string the ACL has to
 * allow (`&socket.io#/#*`), and the one this module probes for.
 */
export const realtimeAdapterChannelPrefix = 'socket.io';
export const realtimeAdapterChannelPattern = `${realtimeAdapterChannelPrefix}#/#*`;
export const realtimeAdapterRequestChannel = `${realtimeAdapterChannelPrefix}-request#/#`;
export const realtimeAdapterResponseChannel = `${realtimeAdapterChannelPrefix}-response#/#`;

/**
 * How long the boot-time probe waits before it stops caring. Two seconds is
 * longer than a healthy local Redis needs and short enough that a Redis that is
 * down cannot delay the API: an unfinished probe is "unknown", and "unknown"
 * behaves exactly like before this check existed.
 */
export const realtimeAdapterCheckTimeoutMs = 2_000;

export type RealtimeAdapterSubscriptionCheck = 'allowed' | 'denied' | 'unknown';

/**
 * Phase 3.1 (plan §3.1): the Socket.IO Redis adapter, so two API instances share
 * one set of rooms instead of each serving a private universe.
 *
 * Four rules the plan calls out:
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
 * 4. **No unhandled command rejections.** The adapter subscribes and publishes
 *    without awaiting, so a *reply* error (an ACL that denies the channel) is a
 *    rejected promise nobody handles — Node then kills the process. The subscribe
 *    and publish commands are wrapped (`attachRealtimeCommandGuards`) so that a
 *    denial is logged and the process stays up.
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
    attachRealtimeCommandGuards(publishClient, logger);
    attachRealtimeCommandGuards(subscribeClient, logger);
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

/**
 * Asks Redis whether this user may subscribe to the channels the adapter will
 * use, before the adapter is installed.
 *
 * `denied` is the answer to act on: the gateway then keeps the in-memory adapter
 * and the API boots degraded instead of dying on the first `PSUBSCRIBE`
 * (`NOPERM No permissions to access a channel`, which is what a Redis ACL that
 * only grants `&socket.io#*` produces — see `ops/redis-acl.line`).
 *
 * `unknown` covers everything else — Redis unreachable, a reply we do not
 * recognise, the timeout above — and means "do what we did before": install the
 * adapter and let ioredis retry, because a Redis that is merely down must not
 * cost us the cross-instance adapter.
 */
export async function checkRealtimeAdapterSubscriptions(
  configuration: RedisConfiguration,
  logger: WebsocketAdapterLogger,
  options: { readonly timeoutMs?: number } = {},
): Promise<RealtimeAdapterSubscriptionCheck> {
  let probe: Redis;
  try {
    probe = createRedisClient(configuration);
  } catch (error) {
    logger.warn(
      `ws_adapter_redis_acl_check=unknown reason=${error instanceof Error ? error.message : String(error)}`,
    );
    return 'unknown';
  }
  try {
    const outcome = await withTimeout(
      probeSubscriptions(probe),
      options.timeoutMs ?? realtimeAdapterCheckTimeoutMs,
    );
    if (outcome === 'timeout') {
      logger.warn('ws_adapter_redis_acl_check=unknown reason=timeout');
      return 'unknown';
    }
    return 'allowed';
  } catch (error) {
    if (isChannelPermissionDenied(error)) {
      logger.warn(
        `ws_adapter_redis_acl_denied channel=${readDeniedChannel(error) ?? realtimeAdapterChannelPattern}`,
      );
      return 'denied';
    }
    logger.warn(
      `ws_adapter_redis_acl_check=unknown reason=${error instanceof Error ? error.message : String(error)}`,
    );
    return 'unknown';
  } finally {
    // `disconnect` rather than `quit`: the probe must not keep a retry loop (or
    // the process) alive when Redis is not answering.
    try {
      probe.disconnect();
    } catch {
      // The connection was never established; nothing to close.
    }
  }
}

/** One line per state change, same shape as the other `ws_*` metrics from Faza 0. */
export function formatWebsocketAdapterStatus(active: boolean): string {
  return `ws_adapter_redis_ok=${active ? 1 : 0}`;
}

/**
 * The adapter never awaits its own commands, so this is where an ACL denial stops
 * being an unhandled rejection: the promise the caller ignores gets a handler that
 * logs one line and keeps the process alive. Methods a client does not have (the
 * fakes in the unit tests) are simply skipped.
 */
export function attachRealtimeCommandGuards(
  client: Redis,
  logger: WebsocketAdapterLogger,
): Redis {
  for (const method of [
    'pSubscribe',
    'psubscribe',
    'subscribe',
    'publish',
  ] as const) {
    const target = client as unknown as Record<string, unknown>;
    const original = target[method];
    if (typeof original !== 'function') {
      continue;
    }
    target[method] = (...args: unknown[]) => {
      const result = (original as (...commandArgs: unknown[]) => unknown).apply(
        client,
        args,
      );
      if (
        typeof result === 'object' &&
        result !== null &&
        typeof (result as Promise<unknown>).catch === 'function'
      ) {
        void (result as Promise<unknown>).catch((error: unknown) => {
          logger.warn(
            `ws_adapter_redis_command_denied command=${method} reason=${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
      return result;
    };
  }
  return client;
}

async function probeSubscriptions(probe: Redis): Promise<void> {
  if (probe.status === 'wait') {
    await probe.connect();
  }
  await probe.psubscribe(realtimeAdapterChannelPattern);
  await probe.subscribe(
    realtimeAdapterRequestChannel,
    realtimeAdapterResponseChannel,
  );
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function isChannelPermissionDenied(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('NOPERM') ||
    error.message.includes('permissions to access a channel')
  );
}

/** ioredis puts the rejected command on the error; it names the offending channel. */
function readDeniedChannel(error: unknown): string | null {
  const command = (error as { readonly command?: { readonly args?: unknown } })
    ?.command;
  const args = command?.args;
  if (!Array.isArray(args) || args.length === 0) {
    return null;
  }
  const [channel] = args as readonly unknown[];
  return typeof channel === 'string' ? channel : null;
}

function attachConnectionErrorLogging(
  client: Redis,
  logger: WebsocketAdapterLogger,
): void {
  client.on('error', (error: Error) => {
    logger.warn(`ws_adapter_redis_error reason=${error.message}`);
  });
}
