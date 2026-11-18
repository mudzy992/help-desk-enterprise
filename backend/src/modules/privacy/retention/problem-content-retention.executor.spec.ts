import { createProblemContentRetentionExecutor } from './problem-content-retention.executor';
import { retentionRedactionMarker } from './retention-markers';

/*
  W7.34 (BA-problems-16): closed and cancelled problems must lose their content
  after the configured period while the skeleton stays reportable, legal holds
  win, and a second run does nothing.
*/
describe('problemContent retention executor', () => {
  const cutoff = new Date('2026-01-01T00:00:00.000Z');
  const closedAt = new Date('2025-11-01T00:00:00.000Z');

  function fakePrisma(problems: unknown[] = [
    {
      id: 'p1',
      sequence: 42,
      status: 'CLOSED',
      closedAt,
      cancelledAt: null,
      knowledgeArticleId: 'a1',
    },
  ]) {
    const tx = {
      problem: {
        count: jest.fn().mockResolvedValue(problems.length),
        // The preview selects status/dates, the batch selects the ids to redact.
        findMany: jest.fn().mockImplementation((args: { select?: Record<string, unknown> }) =>
          Promise.resolve(
            args.select !== undefined && 'id' in args.select
              ? problems
              : problems.map((problem) => ({
                  status: (problem as { status: string }).status,
                  closedAt,
                  cancelledAt: null,
                })),
          ),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: problems.length }),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([{ id: 'n1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      problemEvent: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      problemHandoff: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      problemResolutionRun: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      knowledgeArticle: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    return prisma;
  }

  const executor = (prisma: ReturnType<typeof fakePrisma>) =>
    createProblemContentRetentionExecutor(prisma as never);

  it('counts only closed/cancelled problems that are not redacted yet', async () => {
    const prisma = fakePrisma();
    const preview = await executor(prisma).preview(cutoff);
    expect(preview.count).toBe(1);
    expect(preview.oldestAt?.toISOString()).toBe(closedAt.toISOString());
    const [call] = prisma.problem.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(JSON.stringify(call.where)).toContain(`"title":{"not":"${retentionRedactionMarker}"}`);
  });

  it('keeps the skeleton and redacts every content column in one transaction', async () => {
    const prisma = fakePrisma();
    const batch = await executor(prisma).executeBatch(cutoff);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [call] = prisma.problem.updateMany.mock.calls[0] as [
      { where: { id: { in: string[] } }; data: Record<string, unknown> },
    ];
    expect(call.where.id.in).toEqual(['p1']);
    expect(call.data).toMatchObject({
      title: retentionRedactionMarker,
      description: retentionRedactionMarker,
      rootCause: null,
      workaround: null,
      resolution: null,
      cancelReason: null,
    });
    // Nothing that identifies the problem itself is touched.
    expect(Object.keys(call.data)).not.toContain('status');
    expect(Object.keys(call.data)).not.toContain('sequence');
    expect(Object.keys(call.data)).not.toContain('knowledgeArticleId');
    expect(batch.refs).toEqual(['#42']);
    expect(batch.items).toBe(1);
    expect(batch.done).toBe(true);
  });

  it('redacts the replicas: events, handoffs, resolution runs, inbox copies, draft article', async () => {
    const prisma = fakePrisma();
    await executor(prisma).executeBatch(cutoff);

    expect(prisma.problemEvent.updateMany).toHaveBeenCalledWith({
      where: { problemId: { in: ['p1'] } },
      data: { detail: expect.anything() },
    });
    expect(prisma.problemHandoff.updateMany).toHaveBeenCalledWith({
      where: { problemId: { in: ['p1'] } },
      data: { reason: retentionRedactionMarker, decisionReason: null },
    });
    expect(prisma.problemResolutionRun.updateMany).toHaveBeenCalledWith({
      where: { problemId: { in: ['p1'] } },
      data: { message: retentionRedactionMarker, responseBody: expect.anything(), lastError: null },
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1'] } },
      data: { title: retentionRedactionMarker, body: null, payload: expect.anything() },
    });
    // Only a draft is rewritten; a published article belongs to the KB.
    expect(prisma.knowledgeArticle.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1'] }, status: 'DRAFT' },
      data: { title: retentionRedactionMarker, body: retentionRedactionMarker },
    });
  });

  it('respects legal holds on the owner, the creator and the linked tickets', async () => {
    const prisma = fakePrisma();
    await executor(prisma).executeBatch(cutoff);
    const [call] = prisma.problem.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    const serialized = JSON.stringify(call.where.AND);
    expect(serialized).toContain('"owner":{"legalHoldAt":null}');
    expect(serialized).toContain('"createdBy":{"legalHoldAt":null}');
    expect(serialized).toContain('"legalHoldAt":{"not":null}');
    expect(serialized).toContain('"NOT":{"tickets"');
  });

  it('does nothing when the batch is empty', async () => {
    const prisma = fakePrisma([]);
    const batch = await executor(prisma).executeBatch(cutoff);
    expect(batch).toMatchObject({ items: 0, done: true, refs: [] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
