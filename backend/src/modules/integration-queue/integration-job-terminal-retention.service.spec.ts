import { IntegrationJobStatus } from '../../generated/prisma/enums';
import { terminalJobPayloadRedactedMarker } from './integration-queue.constants';
import { IntegrationJobTerminalRetentionService, terminalJobRetentionBatchSize } from './integration-job-terminal-retention.service';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    ticket: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    integrationJob: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)) };
  return { tx, service: new IntegrationJobTerminalRetentionService(prisma as never) };
}

describe('terminal integration job retention', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  it('redacts old terminal payloads and deletes only rows redacted at least 90 days ago', async () => {
    const { service, tx } = setup();
    tx.integrationJob.findMany.mockResolvedValueOnce([{ id: 'delete', version: 2 }]).mockResolvedValueOnce([{ id: 'redact', version: 3 }]);
    tx.integrationJob.deleteMany.mockResolvedValue({ count: 1 });
    tx.integrationJob.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.sweep(now)).resolves.toEqual({ held: false, deleted: 1, redacted: 1 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.ticket.findFirst.mock.invocationCallOrder[0]!);
    expect(tx.integrationJob.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { status: { in: [IntegrationJobStatus.COMPLETED, IntegrationJobStatus.PUBLISHED_BEST_EFFORT, IntegrationJobStatus.SKIPPED] }, lastError: terminalJobPayloadRedactedMarker, updatedAt: { lt: new Date('2026-08-01T12:00:00Z') } }, take: terminalJobRetentionBatchSize,
    }));
    expect(tx.integrationJob.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { status: { in: [IntegrationJobStatus.COMPLETED, IntegrationJobStatus.PUBLISHED_BEST_EFFORT, IntegrationJobStatus.SKIPPED] }, OR: [{ lastError: null }, { status: IntegrationJobStatus.SKIPPED, lastError: { in: ['TEAMS_DELIVERY_SKIPPED', 'TEAMS_CONVERSATION_GONE'] } }], updatedAt: { lt: new Date('2026-09-30T12:00:00Z') } }, take: terminalJobRetentionBatchSize,
    }));
    expect(tx.integrationJob.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: [{ OR: [{ id: 'delete', version: 2 }] }] }) }));
    expect(tx.integrationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ OR: [{ id: 'redact', version: 3 }] }] }),
      data: { payload: { redacted: true }, lastError: terminalJobPayloadRedactedMarker, updatedAt: now, version: { increment: 1 } },
    }));
  });

  it.each(['ticket', 'user'] as const)('pauses all new retention when a %s legal hold exists', async (kind) => {
    const { service, tx } = setup();
    tx[kind].findFirst.mockResolvedValue({ id: 'held' });
    await expect(service.sweep(now)).resolves.toEqual({ held: true, redacted: 0, deleted: 0 });
    expect(tx.integrationJob.findMany).not.toHaveBeenCalled();
    expect(tx.integrationJob.updateMany).not.toHaveBeenCalled();
    expect(tx.integrationJob.deleteMany).not.toHaveBeenCalled();
  });

  it('does not inspect or mutate jobs if the legal-hold lock fails', async () => {
    const { service, tx } = setup();
    tx.$executeRaw.mockRejectedValue(new Error('lock unavailable'));
    await expect(service.sweep(now)).rejects.toThrow('lock unavailable');
    expect(tx.ticket.findFirst).not.toHaveBeenCalled();
    expect(tx.integrationJob.findMany).not.toHaveBeenCalled();
    expect(tx.integrationJob.updateMany).not.toHaveBeenCalled();
    expect(tx.integrationJob.deleteMany).not.toHaveBeenCalled();
  });

  it('fails closed when legal-hold verification fails', async () => {
    const { service, tx } = setup();
    tx.user.findFirst.mockRejectedValue(new Error('db unavailable'));
    await expect(service.sweep(now)).rejects.toThrow('db unavailable');
    expect(tx.integrationJob.findMany).not.toHaveBeenCalled();
    expect(tx.integrationJob.updateMany).not.toHaveBeenCalled();
    expect(tx.integrationJob.deleteMany).not.toHaveBeenCalled();
  });

  it('does not issue writes for empty batches', async () => {
    const { service, tx } = setup();
    tx.integrationJob.findMany.mockResolvedValue([]);
    await expect(service.sweep(now)).resolves.toEqual({ held: false, redacted: 0, deleted: 0 });
    expect(tx.integrationJob.updateMany).not.toHaveBeenCalled();
    expect(tx.integrationJob.deleteMany).not.toHaveBeenCalled();
  });
});
