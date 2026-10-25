import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { RequestIdempotencyService } from '../../common/idempotency/request-idempotency.service';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('ticket message transactional command boundary', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let idempotency: RequestIdempotencyService;
  let outbox: TransactionalOutboxService;
  const stamp = Date.now();
  let ticketId: string;
  let actorUserId: string;
  const keys = ['ticket-message-it-0001', 'ticket-message-rollback-01'];

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    idempotency = new RequestIdempotencyService(prisma as never);
    outbox = new TransactionalOutboxService(prisma as never);
    const unit = await prisma.organizationalUnit.create({ data: {
      name: 'Message IT', type: 'DIRECTORATE', distinguishedName: `OU=MSG${stamp}`, ouPath: `/msg${stamp}`,
    } });
    const category = await prisma.serviceCategory.create({ data: { name: `Message ${stamp}`, slug: `msg-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Message ${stamp}`, slug: `msg-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const actor = await prisma.user.create({ data: { email: `msg-${stamp}@example.test`, displayName: 'Message actor' } });
    const ticket = await prisma.ticket.create({ data: {
      ticketNumber: `MSG-${stamp}`, title: 'Message boundary', description: 'Integration proof', formData: {},
      priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS', serviceId: service.id,
      formVersionId: form.id, requesterId: actor.id, originUnitId: unit.id,
    } as never });
    ticketId = ticket.id;
    actorUserId = actor.id;
  });

  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { namespace: `ticket.message.${ticketId}` } });
    await prisma.outboxMessage.deleteMany({ where: { topic: 'ticket.message.effects', payload: { path: ['ticketId'], equals: ticketId } } as never });
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorUserId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const execute = (key: string, body: string, effect: () => void = () => undefined) => idempotency.execute({
    namespace: `ticket.message.${ticketId}`, key, request: { ticketId, actorUserId, type: 'USER_REPLY', body },
    operation: async (transaction) => {
      effect();
      const message = await transaction.ticketMessage.create({ data: {
        ticketId, type: 'USER_REPLY', body, authorUserId: actorUserId, idempotencyKey: key,
      } });
      await outbox.enqueue(transaction, { topic: 'ticket.message.effects', dedupeKey: message.id,
        payload: { ticketId, messageId: message.id, messageType: message.type, actorUserId } });
      return { statusCode: 201, body: { id: message.id, ticketId, body } };
    },
  });

  it('replays one committed message/result and rejects payload drift', async () => {
    let effects = 0;
    const first = await execute(keys[0]!, 'one durable reply', () => { effects += 1; });
    const retry = await execute(keys[0]!, 'one durable reply', () => { effects += 1; });
    expect(effects).toBe(1);
    expect(retry).toEqual({ ...first, replayed: true });
    expect(await prisma.ticketMessage.count({ where: { ticketId, idempotencyKey: keys[0] } })).toBe(1);
    expect(await prisma.outboxMessage.count({ where: { topic: 'ticket.message.effects', dedupeKey: first.body.id } })).toBe(1);
    await expect(execute(keys[0]!, 'different payload')).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  });

  it('rolls message and outbox back together when the command fails', async () => {
    await expect(idempotency.execute({
      namespace: `ticket.message.${ticketId}`, key: keys[1]!, request: { body: 'rollback' },
      operation: async (transaction) => {
        const message = await transaction.ticketMessage.create({ data: {
          ticketId, type: 'USER_REPLY', body: 'rollback', authorUserId: actorUserId, idempotencyKey: keys[1],
        } });
        await outbox.enqueue(transaction, { topic: 'ticket.message.effects', dedupeKey: message.id,
          payload: { ticketId, messageId: message.id } });
        throw new Error('fault after outbox');
      },
    })).rejects.toThrow('fault after outbox');
    expect(await prisma.ticketMessage.count({ where: { ticketId, idempotencyKey: keys[1] } })).toBe(0);
  });
});
