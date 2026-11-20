import { createChangeContentRetentionExecutor } from './change-content-retention.executor';
import { retentionRedactionMarker } from './retention-markers';

/*
  BA-changes-17: closed, rejected and cancelled changes must lose their content
  after the configured period while the skeleton stays reportable (the record,
  the calendar, the audit trail and the CAB decision), legal holds win, and a
  second run does nothing. Before this executor a change was kept forever: the
  plans, the CAB vote comments and the event JSON had no retention at all.
*/
describe('changeContent retention executor', () => {
  const cutoff = new Date('2026-01-01T00:00:00.000Z');
  const closedAt = new Date('2025-11-01T00:00:00.000Z');
  const cancelledAt = new Date('2025-10-01T00:00:00.000Z');
  const updatedAt = new Date('2025-09-01T00:00:00.000Z');

  const rows = [
    { id: 'c1', sequence: 42, status: 'CLOSED', closedAt, cancelledAt: null, updatedAt },
    { id: 'c2', sequence: 43, status: 'CANCELLED', closedAt: null, cancelledAt, updatedAt },
    { id: 'c3', sequence: 44, status: 'REJECTED', closedAt: null, cancelledAt: null, updatedAt },
  ];

  function fakePrisma(changes: unknown[] = rows) {
    const tx = {
      changeRequest: {
        count: jest.fn().mockResolvedValue(changes.length),
        // The preview selects the dates, the batch selects the ids to redact.
        findMany: jest.fn().mockImplementation((args: { select?: Record<string, unknown> }) =>
          Promise.resolve(
            args.select !== undefined && 'id' in args.select
              ? changes
              : changes.map((row) => {
                  const change = row as { status: string; closedAt: Date | null; cancelledAt: Date | null; updatedAt: Date };
                  return { status: change.status, closedAt: change.closedAt, cancelledAt: change.cancelledAt, updatedAt: change.updatedAt };
                }),
          ),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: changes.length }),
      },
      changeApproval: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      changeLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      changeEvent: { updateMany: jest.fn().mockResolvedValue({ count: 4 }) },
      serviceDowntimeWindow: {
        findMany: jest.fn().mockResolvedValue([{ id: 'w1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([{ id: 'n1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    return prisma;
  }

  const executor = (prisma: ReturnType<typeof fakePrisma>) => createChangeContentRetentionExecutor(prisma as never);

  it('counts closed, cancelled and rejected changes that are not redacted yet', async () => {
    const prisma = fakePrisma();
    const preview = await executor(prisma).preview(cutoff);
    expect(preview.count).toBe(3);
    // Oldest wins across the three clocks: closedAt, cancelledAt, updatedAt.
    expect(preview.oldestAt?.toISOString()).toBe(updatedAt.toISOString());
    expect(preview.newestAt?.toISOString()).toBe(closedAt.toISOString());
    const [call] = prisma.changeRequest.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    const serialized = JSON.stringify(call.where);
    expect(serialized).toContain(`"title":{"not":"${retentionRedactionMarker}"}`);
    // REJECTED has no timestamp of its own, so the period counts from updatedAt.
    expect(serialized).toContain('"status":"REJECTED"');
    expect(serialized).toContain('"updatedAt":{"lt"');
    expect(serialized).not.toContain('"outcome"');
  });

  it('redacts the content and keeps the skeleton in one transaction', async () => {
    const prisma = fakePrisma();
    const batch = await executor(prisma).executeBatch(cutoff);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [call] = prisma.changeRequest.updateMany.mock.calls[0] as [
      { where: { id: { in: string[] } }; data: Record<string, unknown> },
    ];
    expect(call.where.id.in).toEqual(['c1', 'c2', 'c3']);
    expect(call.data).toEqual({
      title: retentionRedactionMarker,
      description: retentionRedactionMarker,
      reason: retentionRedactionMarker,
      implementationPlan: null,
      backoutPlan: null,
      testPlan: null,
      communicationPlan: null,
      reviewNotes: null,
      cancelReason: null,
    });
    // Nothing that keeps the change reportable is touched.
    for (const kept of ['status', 'sequence', 'impact', 'likelihood', 'risk', 'plannedStart', 'closedAt', 'requesterUserId']) {
      expect(Object.keys(call.data)).not.toContain(kept);
    }
    expect(batch.refs).toEqual(['#42', '#43', '#44']);
    expect(batch.items).toBe(3);
    expect(batch.done).toBe(true);
  });

  it('redacts the replicas: CAB comments, event JSON, calendar window, inbox copy', async () => {
    const prisma = fakePrisma();
    await executor(prisma).executeBatch(cutoff);

    expect(prisma.changeApproval.updateMany).toHaveBeenCalledWith({
      where: { changeId: { in: ['c1', 'c2', 'c3'] } },
      data: { comment: null },
    });
    expect(prisma.changeEvent.updateMany).toHaveBeenCalledWith({
      where: { changeId: { in: ['c1', 'c2', 'c3'] } },
      data: { detail: expect.anything() },
    });
    expect(prisma.serviceDowntimeWindow.updateMany).toHaveBeenCalledWith({
      where: { changeRequestId: { in: ['c1', 'c2', 'c3'] } },
      data: { message: retentionRedactionMarker },
    });
    // The service history kept the same `number · title` in its change log.
    expect(prisma.changeLog.updateMany).toHaveBeenCalledWith({
      where: { entityType: 'service_downtime_window', entityId: { in: ['w1'] } },
      data: { reason: retentionRedactionMarker, diff: { redacted: retentionRedactionMarker } },
    });
    // The notification keeps its translation key and its payload (ids only).
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1'] } },
      data: { body: null },
    });
  });

  it('respects legal holds on the requester and the owner', async () => {
    const prisma = fakePrisma();
    await executor(prisma).executeBatch(cutoff);
    const [call] = prisma.changeRequest.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    const serialized = JSON.stringify(call.where.AND);
    expect(serialized).toContain('"requester":{"legalHoldAt":null}');
    expect(serialized).toContain('"owner":{"legalHoldAt":null}');
    expect(serialized).toContain('"requesterUserId":null');
    expect(serialized).toContain('"ownerUserId":null');
  });

  it('does nothing when the batch is empty', async () => {
    const prisma = fakePrisma([]);
    const batch = await executor(prisma).executeBatch(cutoff);
    expect(batch).toMatchObject({ items: 0, done: true, refs: [] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.serviceDowntimeWindow.findMany).not.toHaveBeenCalled();
    expect(prisma.changeLog.updateMany).not.toHaveBeenCalled();
  });
});
