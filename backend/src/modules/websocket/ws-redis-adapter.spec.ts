import { createRedisClient } from '../../common/redis/create-redis-client';
import {
  createWebsocketRedisAdapter,
  formatWebsocketAdapterStatus,
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
  disconnect(): void;
  quit(): Promise<void>;
};

function createFakeClient(): FakeClient {
  return {
    emitter: new Map(),
    status: 'wait',
    on(event, listener) {
      const listeners = this.emitter.get(event) ?? [];
      listeners.push(listener);
      this.emitter.set(event, listeners);
    },
    disconnect: jest.fn(),
    quit: jest.fn(async () => undefined),
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
