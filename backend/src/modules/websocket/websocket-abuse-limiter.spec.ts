import type { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import type { JwtSigningSecretLoader } from '../authentication/jwt-signing-secret.loader';
import {
  consumeWebsocketTokenBucketScript,
  normalizeSocketClientAddress,
  RedisWebsocketAbuseStore,
  resolveSocketClientAddress,
  startSocketConnectionLeaseRenewal,
  websocketAbuseLimits,
  websocketAbuseLimiterCommandTimeoutMs,
  websocketAbuseRedisKey,
  WebsocketAbuseLimiter,
  WebsocketAbuseLimiterUnavailableError,
} from './websocket-abuse-limiter';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const SIGNING_SECRET = 'websocket-abuse-limiter-signing-secret-test-value';

type RedisEval = jest.Mock<Promise<unknown>, [string, number, ...string[]]>;

function createRedis(evalImplementation?: RedisEval): Redis {
  return {
    eval: evalImplementation ?? jest.fn().mockResolvedValue(1),
  } as unknown as Redis;
}

function createLimiter(
  redis: Redis | undefined = createRedis(),
  load = jest.fn(async () => SIGNING_SECRET),
): WebsocketAbuseLimiter {
  return new WebsocketAbuseLimiter(
    { load } as unknown as JwtSigningSecretLoader,
    redis,
  );
}

describe('WebsocketAbuseLimiter', () => {
  it('normalizes transport-provided IP addresses without trusting forwarding headers', () => {
    expect(normalizeSocketClientAddress(' ::ffff:203.0.113.4 ')).toBe(
      '203.0.113.4',
    );
    expect(normalizeSocketClientAddress('2001:db8::5')).toBe('2001:db8::5');
    expect(normalizeSocketClientAddress('unknown')).toBeNull();
    expect(normalizeSocketClientAddress('not-an-ip')).toBeNull();
    expect(
      resolveSocketClientAddress({
        handshake: {
          address: '192.0.2.10',
          headers: { 'x-forwarded-for': '198.51.100.200' },
        },
      } as unknown as Pick<Socket, 'handshake'>),
    ).toBe('192.0.2.10');
  });

  it('uses scope-separated HMAC keys rather than storing the raw identity', () => {
    const ipKey = websocketAbuseRedisKey(
      'ip-handshake',
      '203.0.113.9',
      SIGNING_SECRET,
    );
    const userKey = websocketAbuseRedisKey(
      'user-handshake',
      'private-user-id',
      SIGNING_SECRET,
    );
    expect(ipKey).not.toContain('203.0.113.9');
    expect(userKey).not.toContain('private-user-id');
    expect(ipKey).not.toBe(
      websocketAbuseRedisKey('user-handshake', '203.0.113.9', SIGNING_SECRET),
    );
  });

  it('fails closed when the transport does not provide a usable client address', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const limiter = createLimiter(createRedis(evalMock));
    await expect(limiter.consumeHandshakeIp('unknown')).resolves.toBe(false);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it('charges the shared IP bucket before authentication and keeps its key private', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const load = jest.fn(async () => SIGNING_SECRET);
    const limiter = createLimiter(createRedis(evalMock), load);
    await expect(limiter.consumeHandshakeIp('203.0.113.15')).resolves.toBe(true);
    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(evalMock).toHaveBeenCalledWith(
      consumeWebsocketTokenBucketScript,
      1,
      expect.stringMatching(/^ws:admission:v1:ip-handshake:[a-f0-9]{64}$/),
      String(websocketAbuseLimits.ipHandshake.capacity),
      String(websocketAbuseLimits.ipHandshake.refillIntervalMs),
      expect.any(String),
    );
    expect(JSON.stringify(evalMock.mock.calls)).not.toContain('203.0.113.15');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('charges the user reconnect bucket and reserves a bounded connection lease', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    const limiter = createLimiter(createRedis(evalMock));
    await expect(
      limiter.admitConnection('private-user-id', 'socket-1'),
    ).resolves.toBe(true);
    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(evalMock.mock.calls[0]?.[2]).toMatch(
      /^ws:admission:v1:user-handshake:[a-f0-9]{64}$/,
    );
    expect(evalMock.mock.calls[1]?.[2]).toMatch(
      /^ws:admission:v1:user-connections:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(evalMock.mock.calls)).not.toContain('private-user-id');
    expect(evalMock.mock.calls[1]?.slice(3, 5)).toEqual([
      'socket-1',
      String(websocketAbuseLimits.maxConnectionsPerUser),
    ]);
  });

  it('does not reserve a connection when the authenticated reconnect bucket is exhausted', async () => {
    const evalMock = jest.fn().mockResolvedValue(0);
    const limiter = createLimiter(createRedis(evalMock));
    await expect(
      limiter.admitConnection('private-user-id', 'socket-1'),
    ).resolves.toBe(false);
    expect(evalMock).toHaveBeenCalledTimes(1);
  });

  it('uses distinct aggregate user buckets for join/leave and presence', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const limiter = createLimiter(createRedis(evalMock));
    await expect(
      limiter.consumeUserAction('private-user-id', 'join_leave'),
    ).resolves.toBe(true);
    await expect(
      limiter.consumeUserAction('private-user-id', 'presence'),
    ).resolves.toBe(true);
    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(evalMock.mock.calls[0]?.[2]).toMatch(
      /^ws:admission:v1:user-join_leave:[a-f0-9]{64}$/,
    );
    expect(evalMock.mock.calls[1]?.[2]).toMatch(
      /^ws:admission:v1:user-presence:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(evalMock.mock.calls)).not.toContain('private-user-id');
  });

  it('renews and releases only the HMAC-keyed socket lease', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const limiter = createLimiter(createRedis(evalMock));
    await expect(
      limiter.renewConnection('private-user-id', 'socket-1'),
    ).resolves.toBe(true);
    await expect(
      limiter.releaseConnection('private-user-id', 'socket-1'),
    ).resolves.toBeUndefined();
    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(evalMock.mock.calls[0]?.[2]).toMatch(
      /^ws:admission:v1:user-connections:[a-f0-9]{64}$/,
    );
    expect(evalMock.mock.calls[1]?.[2]).toMatch(
      /^ws:admission:v1:user-connections:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(evalMock.mock.calls)).not.toContain('private-user-id');
  });

  it('fails closed when Redis is not injected or its command fails', async () => {
    const absent = new WebsocketAbuseLimiter(
      { load: jest.fn(async () => SIGNING_SECRET) } as unknown as JwtSigningSecretLoader,
    );
    await expect(absent.consumeHandshakeIp('203.0.113.1')).rejects.toBeInstanceOf(
      WebsocketAbuseLimiterUnavailableError,
    );

    const unavailable = createLimiter(
      createRedis(jest.fn().mockRejectedValue(new Error('redis unavailable'))),
    );
    await expect(
      unavailable.consumeUserAction('user-1', 'presence'),
    ).rejects.toBeInstanceOf(WebsocketAbuseLimiterUnavailableError);
  });

  it('fails closed when a shared limiter command does not settle before its deadline', async () => {
    jest.useFakeTimers();
    const evalMock = jest
      .fn()
      .mockImplementation(() => new Promise<unknown>(() => undefined)) as unknown as RedisEval;
    const limiter = createLimiter(createRedis(evalMock));
    try {
      const result = limiter.consumeHandshakeIp('203.0.113.2');
      const rejection = expect(result).rejects.toBeInstanceOf(
        WebsocketAbuseLimiterUnavailableError,
      );
      await jest.advanceTimersByTimeAsync(websocketAbuseLimiterCommandTimeoutMs);
      await rejection;
      expect(evalMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries loading the HMAC secret after a temporary configuration failure', async () => {
    const load = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('settings unavailable'))
      .mockResolvedValueOnce(SIGNING_SECRET);
    const limiter = createLimiter(createRedis(), load);
    await expect(
      limiter.consumeUserAction('user-1', 'presence'),
    ).rejects.toBeInstanceOf(WebsocketAbuseLimiterUnavailableError);
    await expect(
      limiter.consumeUserAction('user-1', 'presence'),
    ).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('wraps malformed Redis decisions as unavailable instead of allowing traffic', async () => {
    const limiter = createLimiter(createRedis(jest.fn().mockResolvedValue('unexpected')));
    await expect(
      limiter.consumeHandshakeIp('203.0.113.10'),
    ).rejects.toBeInstanceOf(WebsocketAbuseLimiterUnavailableError);
  });
});

describe('RedisWebsocketAbuseStore scripts', () => {
  it('validates token-bucket inputs before evaluating Lua', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const store = new RedisWebsocketAbuseStore(createRedis(evalMock));
    await expect(
      store.consumeToken('ws:test', { capacity: 0, refillIntervalMs: 100 }),
    ).rejects.toThrow('Invalid WebSocket token bucket policy');
    expect(evalMock).not.toHaveBeenCalled();
  });

  it('atomically reserves, renews, and releases cluster-wide connection leases', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    const store = new RedisWebsocketAbuseStore(createRedis(evalMock));
    await expect(store.reserveConnection('ws:user', 'socket-1', 2, 60_000)).resolves.toBe(true);
    await expect(store.renewConnection('ws:user', 'socket-1', 60_000)).resolves.toBe(true);
    await expect(store.releaseConnection('ws:user', 'socket-1')).resolves.toBeUndefined();
    expect(evalMock).toHaveBeenCalledTimes(3);
  });

  it('disconnects active sockets whose distributed lease can no longer be renewed', async () => {
    jest.useFakeTimers();
    const socket = {
      id: 'socket-lease-1',
      data: {
        principal: {
          subjectId: 'user-1',
          sessionId: 'session-1',
          jti: 'token-1',
          issuedAt: 1,
          expiresAt: 9_999_999_999,
          authzVersion: 1,
        },
        websocketConnectionLeaseMember: 'socket-lease-1',
      },
      disconnect: jest.fn(),
    } as unknown as Socket;
    const limiter = {
      renewConnection: jest.fn().mockResolvedValue(false),
    } as unknown as WebsocketAbuseLimiter;
    const logger = { warn: jest.fn() } as unknown as Pick<Logger, 'warn'>;
    const stop = startSocketConnectionLeaseRenewal(
      {
        sockets: { sockets: new Map([['socket-lease-1', socket]]) },
      } as unknown as Server,
      limiter,
      logger,
    );

    try {
      await jest.advanceTimersByTimeAsync(
        websocketAbuseLimits.connectionLeaseRenewIntervalMs,
      );
      expect(limiter.renewConnection).toHaveBeenCalledWith('user-1', 'socket-lease-1');
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'ws_connection_lease_lost connectionId=socket-lease-1 reason=lease_expired',
      );
    } finally {
      stop();
      jest.useRealTimers();
    }
  });
});
