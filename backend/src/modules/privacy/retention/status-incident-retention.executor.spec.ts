import { createStatusIncidentRetentionExecutor } from './status-incident-retention.executor';

describe('createStatusIncidentRetentionExecutor', () => {
  const cutoff = new Date('2026-04-29T10:00:00Z'); // 180 days ago

  const buildPrisma = (incidents: any[], updates: any[]) => {
    const prisma: any = {
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
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    };
    prisma.serviceIncident.count.mockResolvedValue(
      incidents.filter((i) => i.status === 'RESOLVED' && i.resolvedAt && i.resolvedAt < cutoff && !i.retentionArchivedAt).length,
    );
    prisma.serviceIncidentUpdate.count.mockResolvedValue(
      updates.filter(
        (u) =>
          incidents.some((i) => i.id === u.incidentId && i.status === 'RESOLVED' && i.resolvedAt && i.resolvedAt < cutoff && !i.retentionArchivedAt) &&
          !u.contentRedactedAt,
      ).length,
    );
    prisma.serviceIncident.findMany.mockResolvedValue(
      incidents
        .filter((i) => i.status === 'RESOLVED' && i.resolvedAt && i.resolvedAt < cutoff && !i.retentionArchivedAt)
        .sort((a: any, b: any) => a.resolvedAt.getTime() - b.resolvedAt.getTime())
        .slice(0, 50)
        .map((i) => ({ id: i.id, resolvedAt: i.resolvedAt })),
    );
    prisma.serviceIncidentUpdate.findMany.mockResolvedValue(
      updates.filter((u) => incidentIds(prisma).includes(u.incidentId) && !u.contentRedactedAt).map((u) => ({ id: u.id })),
    );
    prisma.serviceIncident.updateMany.mockResolvedValue({ count: incidents.length });
    return prisma;
  };

  const incidentIds = (prisma: any) =>
    (prisma.serviceIncident.findMany as jest.Mock).mock.results[0]?.value.map((i: any) => i.id) ?? [];

  it('category is statusIncidents', () => {
    const executor = createStatusIncidentRetentionExecutor({} as never);
    expect(executor.category).toBe('statusIncidents');
  });

  it('preview counts due incidents and their updates', async () => {
    const incidents = [
      { id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: null },
      { id: 'i2', status: 'RESOLVED', resolvedAt: new Date('2026-06-01'), retentionArchivedAt: null },
      { id: 'i3', status: 'INVESTIGATING', resolvedAt: null, retentionArchivedAt: null },
      { id: 'i4', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: new Date('2026-09-01') },
    ];
    const updates = [
      { id: 'u1', incidentId: 'i1', contentRedactedAt: null },
      { id: 'u2', incidentId: 'i1', contentRedactedAt: null },
      { id: 'u3', incidentId: 'i2', contentRedactedAt: null },
    ];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma);
    const preview = await executor.preview(cutoff);
    expect(preview.count).toBe(5); // 2 incidents + 3 updates
  });

  it('executeBatch redacts incident title/author and sets retentionArchivedAt', async () => {
    const incidents = [
      { id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: null },
    ];
    const updates = [
      { id: 'u1', incidentId: 'i1', contentRedactedAt: null },
    ];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.items).toBe(3); // 1 incident + 1 update + ... actually 1 incident + 1 update = 2, but we count updates + incidents
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
    const incidents = [{ id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-01-01'), retentionArchivedAt: null }];
    const updates = [];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.done).toBe(true);
  });

  it('returns done=false when batch is exactly the limit', async () => {
    const incidents = Array.from({ length: 50 }, (_, i) => ({
      id: `i${i}`,
      status: 'RESOLVED',
      resolvedAt: new Date('2026-01-01'),
      retentionArchivedAt: null,
    }));
    const updates = [];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.done).toBe(false);
  });

  it('returns empty batch when nothing is due', async () => {
    const incidents = [
      { id: 'i1', status: 'RESOLVED', resolvedAt: new Date('2026-10-01'), retentionArchivedAt: null },
    ];
    const updates = [];
    const prisma = buildPrisma(incidents, updates);
    const executor = createStatusIncidentRetentionExecutor(prisma);
    const batch = await executor.executeBatch(cutoff);
    expect(batch.items).toBe(0);
    expect(batch.done).toBe(true);
  });
});
