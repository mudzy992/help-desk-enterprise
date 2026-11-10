import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { redisTokens } from '../../common/redis/redis.tokens';
import { JwtSigningSecretLoader } from '../authentication/jwt-signing-secret.loader';
import { getSocketPrincipal } from './authenticated-socket';
import { isSocketPrincipal } from './is-socket-principal';

export type WebsocketAbuseAction = 'join_leave' | 'presence';

export type WebsocketTokenBucketPolicy = {
  readonly capacity: number;
  readonly refillIntervalMs: number;
};

export const websocketAbuseLimits = {
  ipHandshake: { capacity: 120, refillIntervalMs: 500 },
  userHandshake: { capacity: 8, refillIntervalMs: 5_000 },
  userJoinLeave: { capacity: 60, refillIntervalMs: 250 },
  userPresence: { capacity: 60, refillIntervalMs: 250 },
  maxConnectionsPerUser: 8,
  connectionLeaseMs: 60_000,
  connectionLeaseRenewIntervalMs: 20_000,
} as const;

const minimumBucketTtlMs = 60_000;
const connectionKeyTtlMultiplier = 4;
export const websocketAbuseLimiterCommandTimeoutMs = 2_000;

export function websocketTokenBucketTtlMs(
  policy: WebsocketTokenBucketPolicy,
): number {
  return Math.max(
    minimumBucketTtlMs,
    policy.capacity * policy.refillIntervalMs * 2,
  );
}

/**
 * Token buckets use the Redis server clock so replicas with slightly skewed
 * system clocks do not refill a shared bucket at different rates.
 */
export const consumeWebsocketTokenBucketScript = [
  "local time = redis.call('TIME')",
  'local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)',
  'local capacity = tonumber(ARGV[1])',
  'local refillIntervalMs = tonumber(ARGV[2])',
  'local ttlMs = tonumber(ARGV[3])',
  "local tokens = tonumber(redis.call('HGET', KEYS[1], 'tokens'))",
  "local updatedAt = tonumber(redis.call('HGET', KEYS[1], 'updatedAt'))",
  'if not tokens or not updatedAt then tokens = capacity; updatedAt = now end',
  'tokens = math.min(capacity, math.max(0, tokens))',
  'if now > updatedAt then tokens = math.min(capacity, tokens + ((now - updatedAt) / refillIntervalMs)) end',
  'local allowed = 0',
  'if tokens >= 1 then tokens = tokens - 1; allowed = 1 end',
  "redis.call('HSET', KEYS[1], 'tokens', string.format('%.6f', tokens), 'updatedAt', tostring(math.max(now, updatedAt)))",
  "redis.call('PEXPIRE', KEYS[1], ttlMs)",
  'return allowed',
].join('\n');

const reserveWebsocketConnectionScript = [
  "local time = redis.call('TIME')",
  'local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)',
  'local member = ARGV[1]',
  'local maximum = tonumber(ARGV[2])',
  'local leaseMs = tonumber(ARGV[3])',
  'local keyTtlMs = tonumber(ARGV[4])',
  "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tostring(now))",
  "if redis.call('ZSCORE', KEYS[1], member) then",
  "  redis.call('ZADD', KEYS[1], now + leaseMs, member)",
  "  redis.call('PEXPIRE', KEYS[1], keyTtlMs)",
  '  return 1',
  'end',
  "if redis.call('ZCARD', KEYS[1]) >= maximum then return 0 end",
  "redis.call('ZADD', KEYS[1], now + leaseMs, member)",
  "redis.call('PEXPIRE', KEYS[1], keyTtlMs)",
  'return 1',
].join('\n');

const renewWebsocketConnectionScript = [
  "local time = redis.call('TIME')",
  'local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)',
  'local member = ARGV[1]',
  'local leaseMs = tonumber(ARGV[2])',
  'local keyTtlMs = tonumber(ARGV[3])',
  "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tostring(now))",
  "if not redis.call('ZSCORE', KEYS[1], member) then return 0 end",
  "redis.call('ZADD', KEYS[1], now + leaseMs, member)",
  "redis.call('PEXPIRE', KEYS[1], keyTtlMs)",
  'return 1',
].join('\n');

const releaseWebsocketConnectionScript = [
  "local removed = redis.call('ZREM', KEYS[1], ARGV[1])",
  "if redis.call('ZCARD', KEYS[1]) == 0 then redis.call('DEL', KEYS[1]) end",
  'return removed',
].join('\n');

export type WebsocketAbuseRedis = Pick<Redis, 'eval'>;

/** Redis-backed primitives are separately injectable with small limits in tests. */
export class RedisWebsocketAbuseStore {
  constructor(private readonly redis: WebsocketAbuseRedis) {}

  async consumeToken(
    key: string,
    policy: WebsocketTokenBucketPolicy,
  ): Promise<boolean> {
    assertTokenBucketPolicy(policy);
    const result = await this.redis.eval(
      consumeWebsocketTokenBucketScript,
      1,
      key,
      String(policy.capacity),
      String(policy.refillIntervalMs),
      String(websocketTokenBucketTtlMs(policy)),
    );
    return decisionFromRedis(result);
  }

  async reserveConnection(
    key: string,
    member: string,
    maximum: number,
    leaseMs: number,
  ): Promise<boolean> {
    assertConnectionArguments(member, maximum, leaseMs);
    const result = await this.redis.eval(
      reserveWebsocketConnectionScript,
      1,
      key,
      member,
      String(maximum),
      String(leaseMs),
      String(connectionKeyTtlMs(leaseMs)),
    );
    return decisionFromRedis(result);
  }

  async renewConnection(
    key: string,
    member: string,
    leaseMs: number,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || member.trim().length === 0) {
      throw new TypeError('Invalid WebSocket connection lease');
    }
    const result = await this.redis.eval(
      renewWebsocketConnectionScript,
      1,
      key,
      member,
      String(leaseMs),
      String(connectionKeyTtlMs(leaseMs)),
    );
    return decisionFromRedis(result);
  }

  async releaseConnection(key: string, member: string): Promise<void> {
    if (member.trim().length === 0) {
      throw new TypeError('Invalid WebSocket connection member');
    }
    const result = await this.redis.eval(
      releaseWebsocketConnectionScript,
      1,
      key,
      member,
    );
    decisionFromRedis(result);
  }
}

export class WebsocketAbuseLimiterUnavailableError extends Error {
  constructor() {
    super('Shared WebSocket abuse limiter is unavailable');
    this.name = 'WebsocketAbuseLimiterUnavailableError';
  }
}

@Injectable()
export class WebsocketAbuseLimiter {
  private readonly store: RedisWebsocketAbuseStore | null;
  private signingSecretPromise: Promise<string> | null = null;

  constructor(
    private readonly signingSecretLoader: JwtSigningSecretLoader,
    @Optional() @Inject(redisTokens.client) redis?: Redis,
  ) {
    this.store = redis === undefined ? null : new RedisWebsocketAbuseStore(redis);
  }

  /** Counts every transport handshake attempt before credential verification. */
  async consumeHandshakeIp(ipAddress: string): Promise<boolean> {
    const ip = normalizeSocketClientAddress(ipAddress);
    if (ip === null) return false;
    return this.withContext(async (store, secret) =>
      store.consumeToken(
        websocketAbuseRedisKey('ip-handshake', ip, secret),
        websocketAbuseLimits.ipHandshake,
      ),
    );
  }

  /**
   * Charges authenticated reconnect attempts and atomically reserves one of a
   * user's bounded cluster-wide connection slots. The initial reservation is a
   * lease, so abandoned handshakes expire even if no disconnect hook is fired.
   */
  async admitConnection(userId: string, connectionId: string): Promise<boolean> {
    if (userId.trim().length === 0 || connectionId.trim().length === 0) {
      return false;
    }
    return this.withContext(async (store, secret) => {
      const userHandshakeAllowed = await store.consumeToken(
        websocketAbuseRedisKey('user-handshake', userId, secret),
        websocketAbuseLimits.userHandshake,
      );
      if (!userHandshakeAllowed) return false;
      return store.reserveConnection(
        websocketAbuseRedisKey('user-connections', userId, secret),
        connectionId,
        websocketAbuseLimits.maxConnectionsPerUser,
        websocketAbuseLimits.connectionLeaseMs,
      );
    });
  }

  /**
   * Shared account-level ceilings complement the existing per-socket guards;
   * opening more sockets cannot multiply join/leave or presence throughput.
   */
  async consumeUserAction(
    userId: string,
    action: WebsocketAbuseAction,
  ): Promise<boolean> {
    if (userId.trim().length === 0) return false;
    return this.withContext((store, secret) =>
      store.consumeToken(
        websocketAbuseRedisKey(`user-${action}`, userId, secret),
        action === 'presence'
          ? websocketAbuseLimits.userPresence
          : websocketAbuseLimits.userJoinLeave,
      ),
    );
  }

  async renewConnection(userId: string, connectionId: string): Promise<boolean> {
    if (userId.trim().length === 0 || connectionId.trim().length === 0) {
      return false;
    }
    return this.withContext((store, secret) =>
      store.renewConnection(
        websocketAbuseRedisKey('user-connections', userId, secret),
        connectionId,
        websocketAbuseLimits.connectionLeaseMs,
      ),
    );
  }

  async releaseConnection(userId: string, connectionId: string): Promise<void> {
    if (userId.trim().length === 0 || connectionId.trim().length === 0) return;
    await this.withContext((store, secret) =>
      store.releaseConnection(
        websocketAbuseRedisKey('user-connections', userId, secret),
        connectionId,
      ),
    );
  }

  private async withContext<T>(
    operation: (store: RedisWebsocketAbuseStore, secret: string) => Promise<T>,
  ): Promise<T> {
    const store = this.store;
    if (store === null) {
      throw new WebsocketAbuseLimiterUnavailableError();
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const operationPromise = (async () => {
      const secret = await this.loadSigningSecret();
      return operation(store, secret);
    })();
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new WebsocketAbuseLimiterUnavailableError()),
        websocketAbuseLimiterCommandTimeoutMs,
      );
      timeout.unref?.();
    });
    try {
      return await Promise.race([operationPromise, timeoutPromise]);
    } catch {
      throw new WebsocketAbuseLimiterUnavailableError();
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private loadSigningSecret(): Promise<string> {
    if (this.signingSecretPromise === null) {
      this.signingSecretPromise = this.signingSecretLoader
        .load()
        .then((secret) => {
          const normalized = secret.trim();
          if (normalized.length < 32) {
            throw new WebsocketAbuseLimiterUnavailableError();
          }
          return normalized;
        })
        .catch((error: unknown) => {
          this.signingSecretPromise = null;
          if (error instanceof WebsocketAbuseLimiterUnavailableError) throw error;
          throw new WebsocketAbuseLimiterUnavailableError();
        });
    }
    return this.signingSecretPromise;
  }
}

/**
 * Socket.IO supplies this address from the transport. Forwarding headers are
 * intentionally ignored because they are client-controlled unless a trusted
 * proxy chain is explicitly configured for the WebSocket engine.
 */
export function resolveSocketClientAddress(
  socket: Pick<Socket, 'handshake'>,
): string | null {
  return normalizeSocketClientAddress(socket.handshake.address);
}

export function normalizeSocketClientAddress(address: string | null | undefined): string | null {
  if (typeof address !== 'string') return null;
  const normalized = address.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized === 'unknown' ||
    normalized === 'undefined' ||
    normalized === 'null'
  ) {
    return null;
  }
  const clientAddress = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized;
  return isIP(clientAddress) === 0 ? null : clientAddress;
}

/** Keys contain only HMAC pseudonyms, never raw user IDs or client IP addresses. */
export function websocketAbuseRedisKey(
  scope: string,
  identity: string,
  signingSecret: string,
): string {
  const normalizedIdentity = identity.trim();
  if (scope.trim().length === 0 || normalizedIdentity.length === 0 || signingSecret.length < 32) {
    throw new TypeError('Invalid WebSocket abuse-limit key input');
  }
  const digest = createHmac('sha256', signingSecret)
    .update(`help-desk-enterprise:websocket-abuse:${scope}:v1\0`)
    .update(normalizedIdentity)
    .digest('hex');
  return `ws:admission:v1:${scope}:${digest}`;
}

/** Renews active per-user leases and disconnects sockets that cannot be fenced. */
export function startSocketConnectionLeaseRenewal(
  server: Server,
  limiter: WebsocketAbuseLimiter,
  logger: Pick<Logger, 'warn'>,
): () => void {
  if (server.sockets?.sockets === undefined) return () => undefined;

  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    const sockets = [...server.sockets.sockets.values()];
    void renewSocketBatch(sockets, limiter, logger).finally(() => {
      running = false;
    });
  }, websocketAbuseLimits.connectionLeaseRenewIntervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function renewSocketBatch(
  sockets: readonly Socket[],
  limiter: WebsocketAbuseLimiter,
  logger: Pick<Logger, 'warn'>,
): Promise<void> {
  const batchSize = 100;
  for (let offset = 0; offset < sockets.length; offset += batchSize) {
    const batch = sockets.slice(offset, offset + batchSize);
    await Promise.all(
      batch.map(async (socket) => {
        const principal = getSocketPrincipal(socket);
        const connectionId = socket.data.websocketConnectionLeaseMember;
        if (
          !isSocketPrincipal(principal) ||
          typeof connectionId !== 'string' ||
          connectionId !== socket.id
        ) {
          return;
        }
        try {
          if (await limiter.renewConnection(principal.subjectId, connectionId)) {
            return;
          }
          logger.warn(
            `ws_connection_lease_lost connectionId=${socket.id} reason=lease_expired`,
          );
        } catch {
          logger.warn(
            `ws_connection_lease_lost connectionId=${socket.id} reason=limiter_unavailable`,
          );
        }
        socket.disconnect(true);
      }),
    );
  }
}

function assertTokenBucketPolicy(policy: WebsocketTokenBucketPolicy): void {
  if (
    !Number.isSafeInteger(policy.capacity) ||
    policy.capacity < 1 ||
    !Number.isSafeInteger(policy.refillIntervalMs) ||
    policy.refillIntervalMs < 1
  ) {
    throw new TypeError('Invalid WebSocket token bucket policy');
  }
}

function assertConnectionArguments(
  member: string,
  maximum: number,
  leaseMs: number,
): void {
  if (
    member.trim().length === 0 ||
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1
  ) {
    throw new TypeError('Invalid WebSocket connection lease');
  }
}

function connectionKeyTtlMs(leaseMs: number): number {
  return Math.max(minimumBucketTtlMs, leaseMs * connectionKeyTtlMultiplier);
}

function decisionFromRedis(result: unknown): boolean {
  const decision = Number(result);
  if (decision !== 0 && decision !== 1) {
    throw new Error('Invalid WebSocket abuse-limiter Redis response');
  }
  return decision === 1;
}
