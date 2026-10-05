import type Redis from 'ioredis';
import {
  redisChannelRetryDelayMs,
  subscribeRedisChannel,
} from './subscribe-redis-channel';

type Handler = (...args: unknown[]) => void;

function createSubscriber() {
  const handlers = new Map<string, Handler[]>();
  const subscriber = {
    status: 'wait' as string,
    connect: jest.fn(async () => {
      subscriber.status = 'ready';
    }),
    subscribe: jest.fn(async () => undefined),
    on: jest.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
    quit: jest.fn(async () => {
      subscriber.status = 'end';
    }),
    disconnect: jest.fn(),
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const handler of handlers.get(event) ?? []) {
      handler(...args);
    }
  };
  return { subscriber, emit };
}

describe('subscribeRedisChannel (Val 3, nalaz iz incidenta)', () => {
  it('subscribes, forwards only its own channel and closes cleanly', async () => {
    const { subscriber, emit } = createSubscriber();
    const source = { duplicate: jest.fn(() => subscriber) };
    const onMessage = jest.fn();
    const logger = { warn: jest.fn(), log: jest.fn() };

    const subscription = await subscribeRedisChannel({
      source: source as unknown as Redis,
      channel: 'tickets:realtime-bridge',
      label: 'ticket_realtime_bridge',
      logger,
      onMessage,
    });

    expect(subscriber.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      'tickets:realtime-bridge',
    );
    expect(subscriber.on).toHaveBeenCalledWith('error', expect.any(Function));
    emit('message', 'tickets:realtime-bridge', '{"kind":"message"}');
    emit('message', 'other:channel', '{"kind":"message"}');
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      'tickets:realtime-bridge',
      '{"kind":"message"}',
    );

    await subscription.close();
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });

  it('does not throw when AUTH is rejected, and retries until it succeeds', async () => {
    jest.useFakeTimers();
    try {
      const { subscriber, emit } = createSubscriber();
      subscriber.connect.mockRejectedValueOnce(
        new Error('WRONGPASS invalid username-password pair or user is disabled.'),
      );
      const source = { duplicate: jest.fn(() => subscriber) };
      const onMessage = jest.fn();
      const logger = { warn: jest.fn(), log: jest.fn() };

      // Boot must survive the rejection (the incident: it killed the process).
      const subscription = await subscribeRedisChannel({
        source: source as unknown as Redis,
        channel: 'integration-queue:edge-event',
        label: 'edge_event_realtime',
        logger,
        onMessage,
      });
      expect(subscriber.subscribe).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('edge_event_realtime_redis_subscribe_skipped'),
      );

      await jest.advanceTimersByTimeAsync(redisChannelRetryDelayMs);
      expect(subscriber.subscribe).toHaveBeenCalledWith(
        'integration-queue:edge-event',
      );
      emit('message', 'integration-queue:edge-event', '{}');
      expect(onMessage).toHaveBeenCalledTimes(1);

      await subscription.close();
      expect(subscriber.quit).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops retrying once closed', async () => {
    jest.useFakeTimers();
    try {
      const { subscriber } = createSubscriber();
      subscriber.connect.mockRejectedValue(new Error('Redis is down'));
      const logger = { warn: jest.fn() };

      const subscription = await subscribeRedisChannel({
        source: { duplicate: jest.fn(() => subscriber) } as unknown as Redis,
        channel: 'integration-queue:edge-event',
        label: 'edge_event_realtime',
        logger,
        onMessage: jest.fn(),
      });
      await subscription.close();
      await jest.advanceTimersByTimeAsync(redisChannelRetryDelayMs * 3);
      expect(subscriber.connect).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns a no-op subscription when the client cannot be duplicated', async () => {
    const logger = { warn: jest.fn() };
    const subscription = await subscribeRedisChannel({
      source: {
        duplicate: jest.fn(() => {
          throw new Error('client is closed');
        }),
      } as unknown as Redis,
      channel: 'integration-queue:edge-event',
      label: 'edge_event_realtime',
      logger,
      onMessage: jest.fn(),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('edge_event_realtime_redis_unavailable'),
    );
    await expect(subscription.close()).resolves.toBeUndefined();
  });
});
