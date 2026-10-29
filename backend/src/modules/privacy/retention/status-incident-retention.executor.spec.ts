import { createStatusIncidentRetentionExecutor } from './status-incident-retention.executor';

type TestIncident = {
  readonly id: string;
  readonly status: string;
  readonly resolvedAt: Date | null;
  readonly retentionArchivedAt: Date | null;
};

type TestUpdate = {
  readonly id: string;
  readonly incidentId: string;
  readonly contentRedactedAt: Date | null;
};

type MockPrisma = {
  readonly serviceIncident: {
    readonly count: jest.Mock;
    readonly findMany: jest.Mock;
    readonly updateMany: jest.Mock;
  };
  readonly serviceIncidentUpdate: {
    readonly count: jest.Mock;
    readonly findMany: jest.Mock;
    readonly updateMany: jest.Mock;
  };
  readonly ticketIncidentLink: {
    readonly deleteMany: jest.Mock;
  };
  readonly serviceIncidentSubscription: {
    readonly deleteMany: jest.Mock;
  };
  readonly $transaction: jest.Mock;
};

describe('createStatusIncidentRetentionExecutor', () => {
  const cutoff = new Date('2026-04-29T10:00:00Z'); // 180 days ago

  const buildPrisma = (incidents: TestIncident[], updates: TestUpdate[]): MockPrisma => {
    const dueIncidentIds = incidents
      .filter(
        (i) => i.status === 'RESOLVED' && i.resolvedAt && i.resolvedAt < cutoff && !i.retentionArchivedAt,
      )
      .sort((a: TestIncident, b: TestIncident) => (a.resolvedAt ?? new Date(0)).getTime() - (b.resolvedAt ?? new Date(0)).getTime())
      .slice(0, 50)
      .map((i) => i.id);

    const prisma: MockPrisma = {
      serviceIncident: {
        count: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      serviceIncidentUpdate: {
        count: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      ticketIncidentLink: { deleteMany: jest.fn() },
      serviceIncidentSubscription: { deleteMany: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: MockPrisma) => unknown) => callback(prisma)),
    };
    prisma.serviceIncident.count.mockResolvedValue(dueIncidentIds.length);
    prisma.serviceIncidentUpdate.count.mockResolvedValue(
      updates.filter((u) => dueIncidentIds.includes(u.incidentId) && !u.contentRedactedAt).length,
    );
    prisma.serviceIncident.findMany.mockResolvedValue(
      dueIncidentIds.map((id) => ({ id, resolvedAt: incidents.find((i) => i.id === id)?.resolvedAt ?? null })),
    );
    prisma.serviceIncidentUpdate.findMany.mockResolvedValue(
      updates.filter((u) => dueIncidentIds.includes(u.incidentId) && !u.contentRedactedAt).map((u) => ({ id: u.id })),
    );
    prisma.serviceIncident.updateMany.mockResolvedValue({ count: dueIncidentIds.length });
    return prisma;
  };

  it('category is statusIncidents', () => {
    const executor = createStatusIncidentRetentionExecutor({} as never);
    expect(executor.category).toBe('statusIncidents');
  });

  it('preview counts due incidents and their updates', async () => {
    const incidents: TestIncident[] = [
      { id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: null },
      { id: 'i2', status: 'RESOLVED', resolvedAt: new Date('2026-06-01'), retentionArchivedAt: null },
      { id: 'i3', status: 'INVESTIGATING', resolvedAt: null, retentionArchivedAt: null },
      { id: 'i4', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: new Date('2026-09-01') },
    ];
    const updates: TestUpdate[] = [
      { id: 'u1', incidentId: 'i1', contentRedactedAt: null },
      { id: 'u2', incidentId: 'i1', contentRedactedAt: null },
      { id: 'u3', incidentId: 'i2', contentRedactedAt: null },
    ];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma as never);
    const preview = await executor.preview(cutoff);
    expect(preview.count).toBe(3); // 1 incident (i1) + 2 updates (u1, u2 on i1)
  });

  it('executeBatch redacts incident title/author and sets retentionArchivedAt', async () => {
    const incidents: TestIncident[] = [
      { id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: null },
    ];
    const updates: TestUpdate[] = [
      { id: 'u1', incidentId: 'i1', contentRedactedAt: null },
    ];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma as never);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.items).toBe(2); // 1 incident + 1 update
    expect(prisma.serviceIncident.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: '[redacted]',
          titleEn: null,
          createdByUserId: null,
          retentionArchivedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.serviceIncidentUpdate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: '[redacted]',
          authorUserId: null,
          contentRedactedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.ticketIncidentLink.deleteMany).toHaveBeenCalledWith({
      where: { incidentId: { in: ['i1'] } },
    });
    expect(prisma.serviceIncidentSubscription.deleteMany).toHaveBeenCalledWith({
      where: { incidentId: { in: ['i1'] } },
    });
  });

  it('returns done when batch is smaller than limit', async () => {
    const incidents: TestIncident[] = [
      { id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: null },
    ];
    const updates: TestUpdate[] = [];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma as never);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.done).toBe(true);
  });

  it('returns done=false when batch is exactly the limit', async () => {
    const incidents: TestIncident[] = Array.from({ length: 50 }, (_, i) => ({
      id: `i${i}`,
      status: 'RESOLVED',
      resolvedAt: new Date('2026-01-01'),
      retentionArchivedAt: null,
    }));
    const updates: TestUpdate[] = [];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma as never);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.done).toBe(false);
  });

  it('returns empty batch when nothing is due', async () => {
    const incidents: TestIncident[] = [
      { id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-10-01'), retentionArchivedAt: null },
    ];
    const updates: TestUpdate[] = [];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma as never);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.items).toBe(0);
    expect(batch.done).toBe(true);
  });
});
