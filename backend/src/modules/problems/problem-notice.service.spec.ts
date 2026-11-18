import { ProblemNoticeService } from './problem-notice.service';
import { problemNoticeMaxAttempts, problemNoticeTopic } from './problem-notice-outbox';
import { problemVersionOccurrence } from './problem-notice-occurrence';

type EnqueueInput = {
  readonly topic: string;
  readonly dedupeKey: string;
  readonly maxAttempts: number;
  readonly payload: unknown;
};

function harness() {
  const outbox = {
    enqueue: jest.fn(async (_transaction: unknown, _input: EnqueueInput) => ({ id: 'o1', created: true })),
  };
  const prisma = { $queryRaw: jest.fn() };
  const service = new ProblemNoticeService(prisma as never, outbox as never);
  return { service, outbox, prisma };
}

const intent = {
  kind: 'status-changed' as const,
  problemId: 'p1',
  status: 'RESOLVED',
  actorUserId: 'u1',
  occurrence: problemVersionOccurrence(4),
};

describe('ProblemNoticeService', () => {
  it('records the intent on the topic with its occurrence as dedupe key', async () => {
    const { service, outbox } = harness();
    await service.enqueue({} as never, [intent]);

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    const [transaction, input] = outbox.enqueue.mock.calls[0];
    expect(transaction).toEqual({});
    expect(input).toEqual(
      expect.objectContaining({
        topic: problemNoticeTopic,
        maxAttempts: problemNoticeMaxAttempts,
        payload: expect.objectContaining({ v: 1, kind: 'status-changed', problemId: 'p1', occurrence: 'v4' }),
      }),
    );
    expect(input.dedupeKey).toMatch(/^problem-notice:status-changed:p1:v4:a[0-9a-f]{12}$/u);
  });

  it('is a no-op without intents and never calls the outbox twice for one intent list', async () => {
    const { service, outbox } = harness();
    await service.enqueue({} as never, []);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('lets a failed insert fail the write it belongs to', async () => {
    const { service, outbox } = harness();
    outbox.enqueue.mockRejectedValueOnce(new Error('OUTBOX_PAYLOAD_TOO_LARGE'));
    await expect(service.enqueue({} as never, [intent])).rejects.toThrow('OUTBOX_PAYLOAD_TOO_LARGE');
  });

  it('writes the after-commit intent with the plain client and swallows its failure', async () => {
    const { service, outbox, prisma } = harness();
    await service.enqueueAfterCommit([intent]);
    expect(outbox.enqueue).toHaveBeenCalledWith(prisma, expect.objectContaining({ topic: problemNoticeTopic }));

    // The user's write already committed: a broken outbox is a warning, not an error.
    outbox.enqueue.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.enqueueAfterCommit([intent])).resolves.toBeUndefined();
  });
});
