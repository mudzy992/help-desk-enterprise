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

type FakeListener = (...args: unknown[]) => void;
type FakeClient = {
  readonly emitter: Map<string, FakeListener[]>;
  readonly status: string;
  on(event: string, listener: FakeListener): void;
  removeListener(event: string, listener: FakeListener): void;
  emit(event: string, ...args: unknown[]): void;
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
    removeListener(event, listener) {
      const listeners = this.emitter.get(event) ?? [];
      this.emitter.set(
        event,
        listeners.filter((candidate) => candidate !== listener),
      );
    },
    emit(event, ...args) {
      for (const listener of this.emitter.get(event) ?? []) {
        listener(...args);
      }
    },
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    quit: jest.fn(async () => undefined),
    psubscribe: jest.fn(async () => undefined),
    subscribe: jest.fn(async () => undefined),
    publish: jest.fn(async () => 0),
  };
}

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
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

  it('builds the adapter from dedicated publish and subscribe clients', () => {
    const publish = createFakeClient();
    const subscribe = createFakeClient();
    createRedisClientMock
      .mockReturnValueOnce(publish as never)
      .mockReturnValueOnce(subscribe as never);

    const handle = createWebsocketRedisAdapter(configuration, logger);

    expect(handle).not.toBeNull();
    expect(createRedisClientMock).toHaveBeenCalledTimes(2);
    expect(handle?.publishClient).toBe(publish);
    expect(handle?.subscribeClient).toBe(subscribe);
    expect(handle?.publishClient).not.toBe(handle?.subscribeClient);
  });

  it('logs a connection error and reports an effective-health failure', () => {
    const client = createFakeClient();
    const failures: string[] = [];
    createRedisClientMock
      .mockReturnValueOnce(client as never)
      .mockReturnValueOnce(createFakeClient() as never);
    const handle = createWebsocketRedisAdapter(configuration, logger, (reason) => {
      failures.push(reason);
    });

    const [listener] = client.emitter.get('error') ?? [];
    expect(listener).toBeDefined();
    expect(() => listener?.(new Error('Connection is closed.'))).not.toThrow();
    expect(failures).toEqual(['connection_error']);
    expect(logger.warn).toHaveBeenCalledWith(
      'ws_adapter_redis_error reason=Connection is closed.',
    );
    expect(handle).not.toBeNull();
  });

  it('returns no adapter when the clients cannot be created', () => {
    const failures: string[] = [];
    createRedisClientMock.mockImplementation(() => {
      throw new Error('redis host is not configured');
    });

    const handle = createWebsocketRedisAdapter(
      configuration,
      logger,
      (reason) => failures.push(reason),
    );

    expect(handle).toBeNull();
    expect(failures).toEqual(['client_creation_failed']);
    expect(logger.warn).toHaveBeenCalledWith(
      'ws_adapter_redis_unavailable reason=redis host is not configured',
    );
  });

  it('closes both Redis connections on shutdown', async () => {
    const publish = createFakeClient();
    const subscribe = createFakeClient();
    createRedisClientMock
      .mockReturnValueOnce(publish as never)
      .mockReturnValueOnce(subscribe as never);

    const handle = createWebsocketRedisAdapter(configuration, logger);
    await handle?.close();

    // Lazy clients that never connected are disconnected, not quit (a quit would
    // first open a connection just to close it).
    expect(publish.disconnect).toHaveBeenCalled();
    expect(subscribe.disconnect).toHaveBeenCalled();
  });

  it('formats the effective adapter state alongside the existing metric', () => {
    expect(formatWebsocketAdapterStatus(true)).toBe('ws_adapter_redis_ok=1');
    expect(formatWebsocketAdapterStatus(false)).toBe('ws_adapter_redis_ok=0');
    expect(formatWebsocketAdapterStatus(true, 'healthy')).toBe(
      'ws_adapter_redis_ok=1 ws_adapter_redis_state=healthy',
    );
  });

  it.each([
    ['publish', 'publish_rejected'],
    ['psubscribe', 'subscribe_rejected'],
    ['subscribe', 'subscribe_rejected'],
  ] as const)(
    'marks a later %s rejection degraded and restores health after the probe recovers',
    async (failingCommand, failureReason) => {
      const publish = createFakeClient();
      const subscribe = createFakeClient();
      const failures: string[] = [];
      const states: string[] = [];
      let rejectCommand = false;

      publish.publish = jest.fn(async (channel: string, nonce: string) => {
        if (rejectCommand && failingCommand === 'publish') {
          throw channelPermissionError('publish', channel);
        }
        subscribe.emit(
          'pmessageBuffer',
          realtimeAdapterChannelPattern,
          Buffer.from(channel),
          Buffer.from(nonce),
        );
        return 1;
      });
      subscribe.psubscribe = jest.fn(async () => {
        if (rejectCommand && failingCommand === 'psubscribe') {
          throw channelPermissionError('psubscribe', realtimeAdapterChannelPattern);
        }
      });
      subscribe.subscribe = jest.fn(async () => {
        if (rejectCommand && failingCommand === 'subscribe') {
          throw channelPermissionError('subscribe', realtimeAdapterRequestChannel);
        }
      });
      const psubscribeCommand = subscribe.psubscribe;
      const subscribeCommand = subscribe.subscribe;
      createRedisClientMock
        .mockReturnValueOnce(publish as never)
        .mockReturnValueOnce(subscribe as never);

      const handle = createWebsocketRedisAdapter(
        configuration,
        logger,
        (reason) => failures.push(reason),
      );
      const stop = handle?.startHealthMonitor(
        (state) => states.push(state),
        { intervalMs: 10, timeoutMs: 100 },
      );
      try {
        await waitFor(() => states.includes('healthy'), 'initial healthy probe');
        expect(psubscribeCommand).toHaveBeenCalledWith(
          realtimeAdapterChannelPattern,
        );
        expect(subscribeCommand).toHaveBeenCalledWith(
          realtimeAdapterRequestChannel,
          realtimeAdapterResponseChannel,
        );

        rejectCommand = true;
        await waitFor(() => states.includes('degraded'), 'degraded probe');
        expect(failures).toContain(failureReason);
        expect(handle?.adapter).toBeDefined();
        expect(
          logger.warn.mock.calls.some(([message]) =>
            String(message).includes('ws_adapter_redis_command_denied'),
          ),
        ).toBe(true);

        rejectCommand = false;
        await waitFor(
          () => states.filter((state) => state === 'healthy').length >= 2,
          'recovered healthy probe',
        );
      } finally {
        stop?.();
        await handle?.close();
      }
    },
  );

  it('does not let a probe started before a command failure restore health', async () => {
    const publish = createFakeClient();
    const subscribe = createFakeClient();
    const states: string[] = [];
    let finishHealthProbe: (() => void) | undefined;

    publish.publish = jest.fn(async (channel: string, nonce: string) => {
      if (channel.includes('#/#health-')) {
        await new Promise<void>((resolve) => {
          finishHealthProbe = resolve;
        });
        subscribe.emit(
          'pmessageBuffer',
          realtimeAdapterChannelPattern,
          Buffer.from(channel),
          Buffer.from(nonce),
        );
        return 1;
      }
      throw channelPermissionError('publish', channel);
    });
    createRedisClientMock
      .mockReturnValueOnce(publish as never)
      .mockReturnValueOnce(subscribe as never);

    const handle = createWebsocketRedisAdapter(configuration, logger);
    if (handle === null) throw new Error('expected adapter handle');
    const stop = handle.startHealthMonitor(
      (state) => states.push(state),
      { intervalMs: 10_000, timeoutMs: 1_000 },
    );

    try {
      await waitFor(() => finishHealthProbe !== undefined, 'in-flight health probe');
      await expect(
        handle.publishClient.publish('socket.io#/#room-1#', 'app-event'),
      ).rejects.toThrow('NOPERM');
      await waitFor(() => states.includes('degraded'), 'command failure');

      finishHealthProbe?.();
      await new Promise((resolve) => setImmediate(resolve));
      expect(states).toContain('degraded');
      expect(states).not.toContain('healthy');
    } finally {
      finishHealthProbe?.();
      stop();
      await handle.close();
    }
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

  it('leaves unknown results unhealthy when Redis is unreachable', async () => {
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

  it('gives up after the boot-probe timeout and lets effective health stay pending', async () => {
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
