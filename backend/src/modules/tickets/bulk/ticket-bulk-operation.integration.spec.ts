import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { claimBulkOperation, completeBulkOperation } from './ticket-bulk-operation';
import type { ExecuteTicketBulkInput, TicketBulkExecutionSummary } from './bulk.types';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('ticket bulk durable operation manifest', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const actorUserId = 'bulk-manifest-actor';
  const operationId = '20000000-0000-4000-8000-000000000001';
  const rollbackId = '20000000-0000-4000-8000-000000000002';
  const body = (id: string, priority = 'HIGH') => ({
    operationId: id, mode: 'atomic' as const, ticketIds: ['ticket-a', 'ticket-b'],
    actionType: 'set_priority' as const, priority, reason: 'integration proof',
  } satisfies ExecuteTicketBulkInput & { operationId: string; mode: 'atomic' });

  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); });
  afterAll(async () => {
    await prisma.ticketBulkOperation.deleteMany({ where: { id: { in: [operationId, rollbackId] } } });
    await prisma.$disconnect();
  });

  it('persists one immutable operation/item manifest and replays the exact terminal result', async () => {
    expect((await claimBulkOperation(prisma, body(operationId), actorUserId)).replay).toBeNull();
    const summary: TicketBulkExecutionSummary = { operationId, mode: 'atomic', outcome: 'SUCCEEDED',
      ticketIds: ['ticket-a', 'ticket-b'], succeeded: 2, failed: 0, rolledBack: 0, skipped: 0 };
    await prisma.$transaction(async (transaction) => {
      await transaction.ticketBulkOperationItem.updateMany({ where: { operationId },
        data: { status: 'SUCCEEDED', attempts: 1, completedAt: new Date() } });
      await completeBulkOperation(transaction, operationId, summary);
    });
    expect((await claimBulkOperation(prisma, body(operationId), actorUserId)).replay).toEqual(summary);
    expect(await prisma.ticketBulkOperationItem.count({ where: { operationId, status: 'SUCCEEDED' } })).toBe(2);
    await expect(claimBulkOperation(prisma, body(operationId, 'CRITICAL'), actorUserId))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  });

  it('rolls item completion and terminal result back together after a fault', async () => {
    await claimBulkOperation(prisma, body(rollbackId), actorUserId);
    await expect(prisma.$transaction(async (transaction) => {
      await transaction.ticketBulkOperationItem.updateMany({ where: { operationId: rollbackId },
        data: { status: 'SUCCEEDED', attempts: 1, completedAt: new Date() } });
      await completeBulkOperation(transaction, rollbackId, { operationId: rollbackId, mode: 'atomic',
        outcome: 'SUCCEEDED', ticketIds: ['ticket-a', 'ticket-b'], succeeded: 2, failed: 0, rolledBack: 0, skipped: 0 });
      throw new Error('fault after terminal result');
    })).rejects.toThrow('fault after terminal result');
    expect(await prisma.ticketBulkOperationItem.count({ where: { operationId: rollbackId, status: 'PENDING' } })).toBe(2);
    expect(await prisma.ticketBulkOperation.count({ where: { id: rollbackId, status: 'PROCESSING', responseBody: { equals: null } as never } })).toBe(1);
  });
});
