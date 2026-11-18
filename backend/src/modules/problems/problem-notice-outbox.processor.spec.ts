import { ProblemNoticeOutboxProcessor } from './problem-notice-outbox.processor';
import { problemNoticePayload, problemNoticeTopic } from './problem-notice-outbox';
import { problemVersionOccurrence } from './problem-notice-occurrence';
import type { OutboxDelivery } from '../../common/outbox/transactional-outbox.service';
import { OutboxError, outboxErrorCodes } from '../../common/outbox/outbox.error';

type Outcome = 'idle' | 'succeeded' | 'retry' | 'dead-letter';

function delivery(overrides: Partial<OutboxDelivery> = {}): OutboxDelivery {
  const payload = problemNoticePayload({
    kind: 'status-changed',
    problemId: 'p1',
    status: 'RESOLVED',
    actorUserId: 'u1',
    occurrence: problemVersionOccurrence(4),
  });
  return {
    id: 'row-1',
    topic: problemNoticeTopic,
    dedupeKey: 'problem-notice:status-changed:p1:v4:a000000000000',
    payload,
    attempts: 1,
    maxAttempts: 8,
    ownerToken: 'token',
    ...overrides,
  } as OutboxDelivery;
}

function harness(outcomes: Outcome[]) {
  const queue = [...outcomes];
  const outbox = {
    dispatchOne: jest.fn(async (_topic: string, handler: (row: OutboxDelivery) => Promise<void>) => {
      const next = queue.shift() ?? 'idle';
      if (next === 'succeeded') await handler(delivery());
      if (next === 'retry') await handler(delivery());
      return next;
    }),
  };
  const notifier = { statusChanged: jest.fn(async () => 1) };
  const prisma = {
    outboxMessage: {
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
  };
  const processor = new ProblemNoticeOutboxProcessor(prisma as never, outbox as never, notifier as never);
  return { processor, outbox, notifier, prisma };
}

describe('ProblemNoticeOutboxProcessor', () => {
  it('delivers the queued intents and stops at the first row that waits', async () => {
    const { processor, outbox, notifier } = harness(['succeeded', 'succeeded', 'idle']);
    await expect(processor.drain()).resolves.toBe(2);
    expect(outbox.dispatchOne).toHaveBeenCalledTimes(3);
    expect(outbox.dispatchOne).toHaveBeenCalledWith(problemNoticeTopic, expect.any(Function));
    expect(notifier.statusChanged).toHaveBeenCalledWith('p1', 'RESOLVED', 'u1', problemVersionOccurrence(4));
  });

  it('ends the pass on a retry or a dead letter instead of spinning', async () => {
    const retrying = harness(['retry', 'succeeded']);
    await expect(retrying.processor.drain()).resolves.toBe(0);
    expect(retrying.outbox.dispatchOne).toHaveBeenCalledTimes(1);

    const dead = harness(['dead-letter', 'succeeded']);
    await expect(dead.processor.drain()).resolves.toBe(0);
    expect(dead.outbox.dispatchOne).toHaveBeenCalledTimes(1);
  });

  it('does not start a second pass while one is running', async () => {
    const { processor } = harness(['succeeded', 'idle']);
    const first = processor.drain();
    // The second tick lands while the first is still claiming rows.
    const second = processor.drain();
    await expect(second).resolves.toBe(0);
    await expect(first).resolves.toBe(1);
  });

  it('fails the row when a delivery throws, so the outbox retries it', async () => {
    const failing = {
      dispatchOne: jest.fn(async (_topic: string, handler: (row: OutboxDelivery) => Promise<void>) => {
        await handler(delivery());
        return 'succeeded' as Outcome;
      }),
    };
    const notifier = { statusChanged: jest.fn(async () => { throw new Error('SMTP down'); }) };
    const processor = new ProblemNoticeOutboxProcessor(
      { outboxMessage: { count: jest.fn(), findFirst: jest.fn() } } as never,
      failing as never,
      notifier as never,
    );
    // The processor never swallows it: the outbox owns the retry and the
    // dead-letter decision, so the row must fail with the delivery.
    await expect(processor.drain()).rejects.toThrow('SMTP down');
    expect(failing.dispatchOne).toHaveBeenCalledWith(problemNoticeTopic, expect.any(Function));
  });

  it('requeues dead letters once per cooldown, and tolerates a replica that was faster', async () => {
    const prisma = {
      outboxMessage: { findMany: jest.fn(async () => [{ id: 'row-a' }, { id: 'row-b' }]) },
    };
    const outbox = {
      dispatchOne: jest.fn(async () => 'idle' as Outcome),
      replayDeadLetter: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new OutboxError(outboxErrorCodes.replayConflict)),
    };
    const processor = new ProblemNoticeOutboxProcessor(prisma as never, outbox as never, {} as never);

    await expect(processor.drain()).resolves.toBe(0);
    expect(outbox.replayDeadLetter).toHaveBeenNthCalledWith(
      1,
      'row-a',
      expect.objectContaining({ actor: 'problem-notice-dispatcher' }),
    );
    // The replay conflict of the second row is the expected race, not a failure.
    expect(outbox.replayDeadLetter).toHaveBeenCalledTimes(2);
    expect(prisma.outboxMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ topic: problemNoticeTopic, status: 'DEAD_LETTER' }) }),
    );

    // Inside the cooldown the rows are left alone.
    await processor.drain();
    expect(prisma.outboxMessage.findMany).toHaveBeenCalledTimes(1);
  });

  it('reports the backlog of the topic for the ops-health card', async () => {
    const counts = [3, 1, 2];
    const prisma = {
      outboxMessage: {
        count: jest.fn(async () => counts.shift() ?? 0),
        findFirst: jest.fn(async () => ({ createdAt: new Date(Date.now() - 5 * 60_000) })),
      },
    };
    const processor = new ProblemNoticeOutboxProcessor(
      prisma as never,
      { dispatchOne: jest.fn() } as never,
      {} as never,
    );
    const snapshot = await processor.snapshot();
    expect(snapshot).toEqual({ pending: 3, processing: 1, deadLetter: 2, oldestPendingAgeMs: expect.any(Number) });
    expect(snapshot.oldestPendingAgeMs).toBeGreaterThanOrEqual(4 * 60_000);
  });
});
