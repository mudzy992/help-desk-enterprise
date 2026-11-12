import { InboundEmailService, inboundEmailLimits } from './inbound-email.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../tickets/tickets.service', () => ({
  TicketsService: class TicketsService {},
}));
jest.mock('../tickets/tickets-collaboration.service', () => ({
  TicketsCollaborationService: class TicketsCollaborationService {},
}));
jest.mock('../tickets/attachments/tickets-attachments.service', () => ({
  TicketsAttachmentsService: class TicketsAttachmentsService {},
}));
jest.mock('../tickets/reopen/tickets-reopen.service', () => ({
  TicketsReopenService: class TicketsReopenService {},
}));

function createService(metadataRows: readonly { id: string }[]) {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(metadataRows);
  const deleteMany = jest.fn().mockResolvedValue({ count: metadataRows.length });
  const prisma = { inboundEmail: { findMany, deleteMany } };
  const settings = {
    getSetting: jest.fn().mockResolvedValue(undefined),
    getSecretForInternalUse: jest.fn().mockResolvedValue(undefined),
  };
  const service = new InboundEmailService(
    prisma as never,
    settings as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, findMany, deleteMany };
}

describe('InboundEmailService.applyRetention metadata batch', () => {
  const now = new Date('2026-10-30T03:20:00.000Z');

  it('deletes at most one stable batch and rechecks the cutoff inside the delete', async () => {
    const rows = Array.from({ length: inboundEmailLimits.retentionBatch }, (_, index) => ({
      id: `row-${index}`,
    }));
    const { service, findMany, deleteMany } = createService(rows);

    await expect(service.applyRetention(now)).resolves.toMatchObject({
      rowsRemoved: inboundEmailLimits.retentionBatch,
    });

    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: inboundEmailLimits.retentionBatch,
      }),
    );
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: rows.map((row) => row.id) },
        createdAt: { lt: expect.any(Date) },
        rawStorageKey: null,
      },
    });
  });

  it('clears only the same eligible key after confirmed removal', async () => {
    const { service, findMany } = createService([]);
    findMany.mockReset()
      .mockResolvedValueOnce([{ id: 'row-1', rawStorageKey: '2025-01/abc.eml.gz' }])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    (service as unknown as { prisma: { inboundEmail: { updateMany: typeof updateMany } } }).prisma.inboundEmail.updateMany = updateMany;
    const rawStore = (service as unknown as { rawStore: { remove: (key: string) => Promise<void>; pruneMonthsBefore: () => Promise<number> } }).rawStore;
    jest.spyOn(rawStore, 'remove').mockResolvedValue();
    jest.spyOn(rawStore, 'pruneMonthsBefore').mockResolvedValue(0);

    await expect(service.applyRetention(now)).resolves.toMatchObject({ rawRemoved: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'row-1', rawStorageKey: '2025-01/abc.eml.gz', createdAt: { lt: expect.any(Date) } },
      data: { rawStorageKey: null },
    });
  });

  it('preserves the raw link and stops before metadata deletion if unlink fails', async () => {
    const { service, findMany, deleteMany } = createService([]);
    findMany.mockReset().mockResolvedValueOnce([{ id: 'row-1', rawStorageKey: '2025-01/abc.eml.gz' }]);
    const updateMany = jest.fn();
    (service as unknown as { prisma: { inboundEmail: { updateMany: typeof updateMany } } }).prisma.inboundEmail.updateMany = updateMany;
    const rawStore = (service as unknown as { rawStore: { remove: (key: string) => Promise<void>; pruneMonthsBefore: () => Promise<number> } }).rawStore;
    jest.spyOn(rawStore, 'remove').mockRejectedValue(new Error('unlink failed'));
    const prune = jest.spyOn(rawStore, 'pruneMonthsBefore');

    await expect(service.applyRetention(now)).rejects.toThrow('unlink failed');
    expect(updateMany).not.toHaveBeenCalled();
    expect(prune).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('deletes nothing when no metadata row is past the cutoff', async () => {
    const { service, deleteMany } = createService([]);

    await expect(service.applyRetention(now)).resolves.toMatchObject({ rowsRemoved: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
