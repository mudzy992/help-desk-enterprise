import { randomUUID } from 'node:crypto';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { closeRedisClient } from '../../common/redis/close-redis-client';
import { createRedisClient } from '../../common/redis/create-redis-client';
import type { RedisConfiguration } from '../../common/redis/redis.types';
import type {
  WebsocketAdapterFailureListener,
  WebsocketAdapterHealthListener,
  WebsocketAdapterHealthState,
} from './websocket-adapter-health.types';

/** The slice of `Logger` this module needs (keeps the unit test logger-free). */
export type WebsocketAdapterLogger = {
  readonly warn: (message: string) => void;
  readonly log: (message: string) => void;
};

export type WebsocketAdapterHealthMonitorOptions = {
  readonly intervalMs: number;
  readonly timeoutMs: number;
};

type RealtimeAdapterHealthMonitor = {
  readonly stop: () => void;
  readonly reportFailure: WebsocketAdapterFailureListener;
};

export type WebsocketRedisAdapterHandle = {
  readonly adapter: ReturnType<typeof createAdapter>;
  readonly publishClient: Redis;
  readonly subscribeClient: Redis;
  startHealthMonitor(
    listener: WebsocketAdapterHealthListener,
    options?: Partial<WebsocketAdapterHealthMonitorOptions>,
  ): () => void;
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

/** Boot probe budget; failure to prove ACL access leaves runtime probing to the gateway. */
export const realtimeAdapterCheckTimeoutMs = 2_000;
/** Effective-health probe cadence and deadline. */
export const realtimeAdapterHealthProbeIntervalMs = 15_000;
export const realtimeAdapterHealthProbeTimeoutMs = 2_000;

export type RealtimeAdapterSubscriptionCheck = 'allowed' | 'denied' | 'unknown';

/**
 * Phase 3.1 (plan §3.1): the Socket.IO Redis adapter, so two API instances share
 * one set of rooms instead of each serving a private universe.
 *
 * The runtime health probe uses the live adapter publish/subscriber clients. It
 * re-acknowledges the required adapter subscriptions on the real subscriber,
 * then PUBLISHes a nonce to a random, unjoined room through the real publisher
 * and waits for it on the adapter's actual PSUBSCRIBE stream. This exercises the
 * real room-channel ACL without delivering a user event; a local adapter
 * fallback is never treated as equivalent to cross-instance delivery.
 */
export function createWebsocketRedisAdapter(
  configuration: RedisConfiguration,
  logger: WebsocketAdapterLogger,
  onFailure?: WebsocketAdapterFailureListener,
): WebsocketRedisAdapterHandle | null {
  let publishClient: Redis | undefined;
  let subscribeClient: Redis | undefined;
  try {
    const activePublishClient = createRedisClient(configuration);
    publishClient = activePublishClient;
    const activeSubscribeClient = createRedisClient(configuration);
    subscribeClient = activeSubscribeClient;
    let activeHealthMonitor: RealtimeAdapterHealthMonitor | null = null;
    const reportFailure: WebsocketAdapterFailureListener = (reason) => {
      activeHealthMonitor?.reportFailure(reason);
      onFailure?.(reason);
    };
    attachConnectionErrorLogging(activePublishClient, logger, reportFailure);
    attachConnectionErrorLogging(activeSubscribeClient, logger, reportFailure);
    attachRealtimeCommandGuards(activePublishClient, logger, reportFailure);
    attachRealtimeCommandGuards(activeSubscribeClient, logger, reportFailure);

    const adapter = createAdapter(activePublishClient, activeSubscribeClient);
    let closed = false;

    return {
      adapter,
      publishClient: activePublishClient,
      subscribeClient: activeSubscribeClient,
      startHealthMonitor: (listener, options = {}) => {
        if (closed) {
          return () => undefined;
        }
        if (activeHealthMonitor === null) {
          activeHealthMonitor = startRealtimeAdapterHealthMonitor(
            activePublishClient,
            activeSubscribeClient,
            listener,
            options,
          );
        }
        const monitor = activeHealthMonitor;
        return () => {
          if (activeHealthMonitor !== monitor) {
            return;
          }
          monitor.stop();
          activeHealthMonitor = null;
        };
      },
      close: async () => {
        closed = true;
        activeHealthMonitor?.stop();
        activeHealthMonitor = null;
        await Promise.all([
          closeRedisClient(activePublishClient),
          closeRedisClient(activeSubscribeClient),
        ]);
      },
    };
  } catch (error) {
    for (const client of [publishClient, subscribeClient]) {
      try {
        client?.disconnect();
      } catch {
        // Construction failed before a connection was usable; keep the original error.
      }
    }
    onFailure?.('client_creation_failed');
    logger.warn(
      `ws_adapter_redis_unavailable reason=${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Asks Redis whether this user may subscribe to the channels the adapter will
 * use, before the adapter is installed. This boot result is only an initial
 * decision; `unknown` does not count as healthy and the runtime probe remains
 * responsible for proving effective Pub/Sub delivery.
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

/** One line per effective-state transition, same shape as the other `ws_*` metrics. */
export function formatWebsocketAdapterStatus(
  active: boolean,
  state?: WebsocketAdapterHealthState,
): string {
  const base = `ws_adapter_redis_ok=${active ? 1 : 0}`;
  return state === undefined ? base : `${base} ws_adapter_redis_state=${state}`;
}

/**
 * The adapter never awaits its own commands, so a rejected promise needs an
 * explicit handler. It also reports command failures to the process-local
 * effective-health state. Clients without a command (the unit-test fakes) are
 * simply skipped.
 */
export function attachRealtimeCommandGuards(
  client: Redis,
  logger: WebsocketAdapterLogger,
  onFailure?: WebsocketAdapterFailureListener,
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
          onFailure?.(
            method === 'publish' ? 'publish_rejected' : 'subscribe_rejected',
          );
          const outcome = isChannelPermissionDenied(error) ? 'denied' : 'failed';
          logger.warn(
            `ws_adapter_redis_command_${outcome} command=${method} reason=${error instanceof Error ? error.message : String(error)}`,
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

function startRealtimeAdapterHealthMonitor(
  publishClient: Redis,
  subscribeClient: Redis,
  listener: WebsocketAdapterHealthListener,
  options: Partial<WebsocketAdapterHealthMonitorOptions>,
): RealtimeAdapterHealthMonitor {
  const intervalMs = options.intervalMs ?? realtimeAdapterHealthProbeIntervalMs;
  const timeoutMs = options.timeoutMs ?? realtimeAdapterHealthProbeTimeoutMs;
  const healthRoom = `health-${randomUUID()}`;
  const healthChannel = `${realtimeAdapterChannelPrefix}#/#${healthRoom}#`;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let failureGeneration = 0;

  const probe = async (): Promise<void> => {
    // These are idempotent Redis subscriptions. Re-acknowledging them on the
    // actual adapter subscriber checks its ACL/connection after reconnects too.
    await subscribeClient.psubscribe(realtimeAdapterChannelPattern);
    await subscribeClient.subscribe(
      realtimeAdapterRequestChannel,
      realtimeAdapterResponseChannel,
    );
    await publishAndWaitForEcho(
      publishClient,
      subscribeClient,
      healthChannel,
      randomUUID(),
      timeoutMs,
    );
  };

  const reportFailure: WebsocketAdapterFailureListener = (reason) => {
    failureGeneration += 1;
    if (!stopped) listener('degraded', reason);
  };

  const check = (): void => {
    if (stopped || inFlight !== null) {
      return;
    }
    const generationAtStart = failureGeneration;
    const current = probe();
    inFlight = current;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (!stopped) listener('degraded', 'probe_timeout');
    }, timeoutMs);
    void current
      .then(() => {
        if (
          !stopped &&
          !timedOut &&
          failureGeneration === generationAtStart
        ) {
          listener('healthy', 'probe_ok');
        }
      })
      .catch((error: unknown) => {
        if (
          !stopped &&
          !timedOut &&
          failureGeneration === generationAtStart
        ) {
          listener(
            'degraded',
            isChannelPermissionDenied(error) ? 'acl_denied' : 'probe_failed',
          );
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (inFlight === current) {
          inFlight = null;
        }
      });
  };

  const onReady = (): void => check();
  const onConnectionProblem = (): void => reportFailure('connection_error');
  const clients = [publishClient, subscribeClient];
  for (const client of clients) {
    client.on('ready', onReady);
    client.on('close', onConnectionProblem);
    client.on('reconnecting', onConnectionProblem);
    client.on('end', onConnectionProblem);
  }

  check();
  const interval = setInterval(check, intervalMs);
  interval.unref();

  return {
    reportFailure,
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(interval);
      for (const client of clients) {
        client.removeListener('ready', onReady);
        client.removeListener('close', onConnectionProblem);
        client.removeListener('reconnecting', onConnectionProblem);
        client.removeListener('end', onConnectionProblem);
      }
    },
  };
}

function publishAndWaitForEcho(
  publishClient: Redis,
  subscribeClient: Redis,
  channel: string,
  nonce: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let publishAcknowledged = false;
    let echoReceived = false;
    const timeout = setTimeout(() => {
      finish(new Error('websocket adapter Pub/Sub echo timed out'));
    }, timeoutMs);

    const finish = (error?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      subscribeClient.removeListener('pmessageBuffer', onPatternMessage);
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    };
    const maybeFinish = (): void => {
      if (publishAcknowledged && echoReceived) finish();
    };
    const onPatternMessage = (
      _pattern: string,
      receivedChannel: Buffer,
      receivedNonce: Buffer,
    ): void => {
      if (
        _pattern.toString() !== realtimeAdapterChannelPattern ||
        receivedChannel.toString() !== channel ||
        receivedNonce.toString() !== nonce
      ) {
        return;
      }
      echoReceived = true;
      maybeFinish();
    };

    // `@socket.io/redis-adapter` ignores unknown rooms before decoding the
    // payload. The random health room is never joined by a socket, so this
    // exercises the real room-channel PUBLISH/PSUBSCRIBE path without emitting
    // an application event or feeding a synthetic packet to the adapter.
    subscribeClient.on('pmessageBuffer', onPatternMessage);
    let publication: Promise<number>;
    try {
      publication = publishClient.publish(channel, nonce);
    } catch (error) {
      finish(error);
      return;
    }
    void publication.then(
      (subscribers) => {
        if (typeof subscribers !== 'number' || subscribers < 1) {
          finish(new Error('websocket adapter room channel has no subscriber'));
          return;
        }
        publishAcknowledged = true;
        maybeFinish();
      },
      (error: unknown) => finish(error),
    );
  });
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
  onFailure?: WebsocketAdapterFailureListener,
): void {
  client.on('error', (error: Error) => {
    onFailure?.('connection_error');
    logger.warn(`ws_adapter_redis_error reason=${error.message}`);
  });
}
