import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { RequestIdempotencyService } from '../../../common/idempotency/request-idempotency.service';
import { TransactionalOutboxService } from '../../../common/outbox/transactional-outbox.service';
import { recordConfidentialAccessAudit } from './record-confidential-access-audit';
import type { TicketConfidentialConfiguration } from './confidential.types';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('confidential break-glass atomic command boundary', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let idempotency: RequestIdempotencyService;
  let outbox: TransactionalOutboxService;
  let ticketId: string;
  let actorUserId: string;
  let unitId: string;
  const stamp = Date.now();
  const correlationId = '10000000-0000-4000-8000-000000000001';
  const rollbackCorrelationId = '10000000-0000-4000-8000-000000000002';
  const configuration = { auditViews: true } as TicketConfidentialConfiguration;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    idempotency = new RequestIdempotencyService(prisma as never);
    outbox = new TransactionalOutboxService(prisma as never);
    const unit = await prisma.organizationalUnit.create({ data: {
      name: 'Break glass IT', type: 'DIRECTORATE', distinguishedName: `OU=BG${stamp}`, ouPath: `/bg${stamp}`,
    } });
    const category = await prisma.serviceCategory.create({ data: { name: `Break glass ${stamp}`, slug: `bg-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Break glass ${stamp}`, slug: `bg-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const actor = await prisma.user.create({ data: { email: `bg-${stamp}@example.test`, displayName: 'Break glass actor' } });
    const ticket = await prisma.ticket.create({ data: {
      ticketNumber: `BG-${stamp}`, title: 'Atomic break glass', description: 'Integration proof', formData: {},
      priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS', serviceId: service.id,
      formVersionId: form.id, requesterId: actor.id, originUnitId: unit.id, isConfidential: true,
    } as never });
    ticketId = ticket.id;
    actorUserId = actor.id;
    unitId = unit.id;
  });

  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { namespace: `ticket.break_glass.${ticketId}` } });
    await prisma.outboxMessage.deleteMany({ where: { topic: 'ticket.break_glass.effects', payload: { path: ['ticketId'], equals: ticketId } } as never });
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorUserId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const execute = (key: string, reason: string, fault = false) => idempotency.execute({
    namespace: `ticket.break_glass.${ticketId}`,
    key,
    request: { ticketId, actorUserId, reason },
    operation: async (transaction) => {
      const grant = await transaction.breakGlassEvent.create({ data: {
        ticketId, actorUserId, reason, correlationId: key, expiresAt: new Date(Date.now() + 900_000),
      } });
      await recordConfidentialAccessAudit(transaction as never, {
        ticketId, organizationalUnitId: unitId, actorUserId, result: 'break_glass', via: 'break_glass',
        reason, correlationId: key, configuration, writeSystemEvent: true,
      });
      await outbox.enqueue(transaction, { topic: 'ticket.break_glass.effects', dedupeKey: key,
        payload: { ticketId, actorUserId, correlationId: key, expiresAt: grant.expiresAt?.toISOString() ?? null } });
      if (fault) throw new Error('fault after durable intent');
      return { statusCode: 201, body: { correlationId: key, ticketId, actorUserId, createdAt: grant.createdAt.toISOString() } };
    },
  });

  it('serializes concurrent retries, persists one complete command, replays, and rejects drift', async () => {
    const [first, concurrent] = await Promise.all([
      execute(correlationId, 'Legal review'), execute(correlationId, 'Legal review'),
    ]);
    expect([first.replayed, concurrent.replayed].filter(Boolean)).toHaveLength(1);
    expect(first.body).toEqual(concurrent.body);
    expect(await prisma.breakGlassEvent.count({ where: { correlationId } })).toBe(1);
    expect(await prisma.outboxMessage.count({ where: { topic: 'ticket.break_glass.effects', dedupeKey: correlationId } })).toBe(1);
    expect(await prisma.changeLog.count({ where: { entityId: ticketId, diff: { path: ['after', 'correlationId'], equals: correlationId } } as never })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: ticketId, metadata: { path: ['correlationId'], equals: correlationId } } as never })).toBe(1);
    expect(await prisma.ticketMessage.count({ where: { ticketId, type: 'SYSTEM_EVENT', body: 'ticket_confidential_break_glass' } })).toBe(1);
    await expect(execute(correlationId, 'Changed reason')).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  });

  it('rolls grant, audit, change, system event, outbox, and idempotency result back on a fault', async () => {
    await expect(execute(rollbackCorrelationId, 'Rollback proof', true)).rejects.toThrow('fault after durable intent');
    expect(await prisma.breakGlassEvent.count({ where: { correlationId: rollbackCorrelationId } })).toBe(0);
    expect(await prisma.outboxMessage.count({ where: { dedupeKey: rollbackCorrelationId } })).toBe(0);
    expect(await prisma.changeLog.count({ where: { entityId: ticketId, diff: { path: ['after', 'correlationId'], equals: rollbackCorrelationId } } as never })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: ticketId, metadata: { path: ['correlationId'], equals: rollbackCorrelationId } } as never })).toBe(0);
    expect(await prisma.idempotencyRecord.count({ where: { namespace: `ticket.break_glass.${ticketId}`, key: rollbackCorrelationId } })).toBe(0);
  });
});
