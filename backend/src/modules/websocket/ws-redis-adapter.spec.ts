import { createRedisClient } from '../../common/redis/create-redis-client';
import {
  attachRealtimeCommandGuards,
  checkRealtimeAdapterSubscriptions,
  createWebsocketRedisAdapter,
  formatWebsocketAdapterStatus,
  realtimeAdapterChannelPattern,
  realtimeAdapterRequestChannel,
  realtimeAdapterResponseChannel,
} from './ws-redis-adapter';

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn((publish: unknown, subscribe: unknown) => ({
    publish,
    subscribe,
  })),
}));

jest.mock('../../common/redis/create-redis-client', () => ({
  createRedisClient: jest.fn(),
}));

const createRedisClientMock = createRedisClient as jest.MockedFunction<
  typeof createRedisClient
>;

type FakeClient = {
  readonly emitter: Map<string, ((error: Error) => void)[]>;
  readonly status: string;
  on(event: string, listener: (error: Error) => void): void;
  connect(): Promise<void>;
  disconnect(): void;
  quit(): Promise<void>;
  psubscribe: jest.Mock;
  subscribe: jest.Mock;
  publish: jest.Mock;
};

/** Same shape an ioredis reply error has when the ACL denies a channel. */
function channelPermissionError(command: string, channel: string): Error {
  return Object.assign(
    new Error('NOPERM No permissions to access a channel'),
    { command: { name: command, args: [channel] } },
  );
}

function createFakeClient(): FakeClient {
  return {
    emitter: new Map(),
    status: 'wait',
    on(event, listener) {
      const listeners = this.emitter.get(event) ?? [];
      listeners.push(listener);
      this.emitter.set(event, listeners);
    },
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    quit: jest.fn(async () => undefined),
    psubscribe: jest.fn(async () => undefined),
    subscribe: jest.fn(async () => undefined),
    publish: jest.fn(async () => undefined),
  };
}

const configuration = {
  host: 'redis-core',
  port: 6379,
  keyPrefix: '',
} as never;

describe('createWebsocketRedisAdapter', () => {
  const logger = { warn: jest.fn(), log: jest.fn() };

  beforeEach(() => {
    logger.warn.mockReset();
    logger.log.mockReset();
    createRedisClientMock.mockReset();
  });

  it('builds the adapter from two dedicated clients', () => {
    const first = createFakeClient();
    const second = createFakeClient();
    createRedisClientMock
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);

    const handle = createWebsocketRedisAdapter(configuration, logger);

    expect(handle).not.toBeNull();
    expect(createRedisClientMock).toHaveBeenCalledTimes(2);
    expect(handle?.publishClient).toBe(first);
    expect(handle?.subscribeClient).toBe(second);
    expect(handle?.publishClient).not.toBe(handle?.subscribeClient);
  });

  it('logs a connection error instead of letting it crash the process', () => {
    const client = createFakeClient();
    createRedisClientMock
      .mockReturnValueOnce(client as never)
      .mockReturnValueOnce(createFakeClient() as never);
    const handle = createWebsocketRedisAdapter(configuration, logger);

    const [listener] = client.emitter.get('error') ?? [];
    expect(listener).toBeDefined();
    expect(() => listener?.(new Error('Connection is closed.'))).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'ws_adapter_redis_error reason=Connection is closed.',
    );
    expect(handle).not.toBeNull();
  });

  it('falls back to the in-memory adapter when the clients cannot be created', () => {
    createRedisClientMock.mockImplementation(() => {
      throw new Error('redis host is not configured');
    });

    const handle = createWebsocketRedisAdapter(configuration, logger);

    expect(handle).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'ws_adapter_redis_unavailable reason=redis host is not configured',
    );
  });

  it('closes both connections on shutdown', async () => {
    const first = createFakeClient();
    const second = createFakeClient();
    createRedisClientMock
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);

    const handle = createWebsocketRedisAdapter(configuration, logger);
    await handle?.close();

    // Lazy clients that never connected are disconnected, not quit (a quit would
    // first open a connection just to close it).
    expect(first.disconnect).toHaveBeenCalled();
    expect(second.disconnect).toHaveBeenCalled();
  });

  it('formats the adapter metric like the other ws_* lines', () => {
    expect(formatWebsocketAdapterStatus(true)).toBe('ws_adapter_redis_ok=1');
    expect(formatWebsocketAdapterStatus(false)).toBe('ws_adapter_redis_ok=0');
  });
});

describe('attachRealtimeCommandGuards', () => {
  const logger = { warn: jest.fn(), log: jest.fn() };

  beforeEach(() => {
    logger.warn.mockReset();
  });

  it('keeps a denied publish from becoming an unhandled rejection', async () => {
    const client = createFakeClient();
    client.publish = jest.fn(async () => {
      throw channelPermissionError('publish', 'socket.io#/#room-1#');
    });
    attachRealtimeCommandGuards(client as never, logger);

    // The adapter calls publish without awaiting it; the guard must swallow the
    // rejection and leave one log line behind.
    client.publish('socket.io#/#room-1#', 'x');
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ws_adapter_redis_command_denied command=publish'),
    );
  });

  it('passes a successful command through unchanged', async () => {
    const client = createFakeClient();
    const original = client.subscribe;
    attachRealtimeCommandGuards(client as never, logger);

    await expect(
      (client.subscribe as jest.Mock)(realtimeAdapterRequestChannel),
    ).resolves.toBeUndefined();
    expect(original).toHaveBeenCalledWith(realtimeAdapterRequestChannel);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('skips clients that do not have the command (the unit-test fakes)', () => {
    const bare = { on: jest.fn(), disconnect: jest.fn() };
    expect(() => attachRealtimeCommandGuards(bare as never, logger)).not.toThrow();
  });
});

describe('checkRealtimeAdapterSubscriptions', () => {
  const logger = { warn: jest.fn(), log: jest.fn() };

  beforeEach(() => {
    logger.warn.mockReset();
    logger.log.mockReset();
    createRedisClientMock.mockReset();
  });

  it('reports the adapter channels as allowed and closes the probe', async () => {
    const probe = createFakeClient();
    createRedisClientMock.mockReturnValueOnce(probe as never);

    await expect(
      checkRealtimeAdapterSubscriptions(configuration, logger),
    ).resolves.toBe('allowed');

    expect(probe.connect).toHaveBeenCalledTimes(1);
    expect(probe.psubscribe).toHaveBeenCalledWith(realtimeAdapterChannelPattern);
    expect(probe.subscribe).toHaveBeenCalledWith(
      realtimeAdapterRequestChannel,
      realtimeAdapterResponseChannel,
    );
    expect(probe.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports denied when the ACL refuses the pattern subscription', async () => {
    const probe = createFakeClient();
    probe.psubscribe = jest.fn(async () => {
      throw channelPermissionError('psubscribe', realtimeAdapterChannelPattern);
    });
    createRedisClientMock.mockReturnValueOnce(probe as never);

    await expect(
      checkRealtimeAdapterSubscriptions(configuration, logger),
    ).resolves.toBe('denied');

    expect(logger.warn).toHaveBeenCalledWith(
      `ws_adapter_redis_acl_denied channel=${realtimeAdapterChannelPattern}`,
    );
    expect(probe.disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous behaviour when Redis is unreachable', async () => {
    const probe = createFakeClient();
    probe.connect = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
    });
    createRedisClientMock.mockReturnValueOnce(probe as never);

    await expect(
      checkRealtimeAdapterSubscriptions(configuration, logger),
    ).resolves.toBe('unknown');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ws_adapter_redis_acl_check=unknown reason=connect ECONNREFUSED'),
    );
  });

  it('gives up after the timeout and leaves the decision to ioredis', async () => {
    const probe = createFakeClient();
    probe.connect = jest.fn(() => new Promise<void>(() => undefined));
    createRedisClientMock.mockReturnValueOnce(probe as never);

    await expect(
      checkRealtimeAdapterSubscriptions(configuration, logger, { timeoutMs: 5 }),
    ).resolves.toBe('unknown');

    expect(logger.warn).toHaveBeenCalledWith(
      'ws_adapter_redis_acl_check=unknown reason=timeout',
    );
    expect(probe.disconnect).toHaveBeenCalledTimes(1);
  });
});
