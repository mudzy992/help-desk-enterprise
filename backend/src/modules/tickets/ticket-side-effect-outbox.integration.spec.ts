import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { ticketMessageDeliveryTopic, ticketSlaEffectsTopic } from './ticket-side-effect-outbox-reconciler.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('ticket post-commit side-effect outbox', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let ticketId: string;
  let actorId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({ data: { name: `Effects ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=FX${stamp}`, ouPath: `/fx${stamp}` } });
    const category = await prisma.serviceCategory.create({ data: { name: `Effects ${stamp}`, slug: `fx-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Effects ${stamp}`, slug: `fx-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const actor = await prisma.user.create({ data: { email: `effects-${stamp}@example.test`, displayName: 'Effects actor' } });
    actorId = actor.id;
    const ticket = await prisma.ticket.create({ data: { ticketNumber: `FX-${stamp}`, title: 'Durable effects', description: 'proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'PENDING', serviceId: service.id, formVersionId: form.id, requesterId: actor.id, originUnitId: unit.id } as never });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { topic: { in: [ticketMessageDeliveryTopic, ticketSlaEffectsTopic] }, payload: { path: ['ticketId'], equals: ticketId } } as never });
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('commits message and SLA intents atomically and rolls both back with their writes', async () => {
    const message = await prisma.ticketMessage.create({ data: { ticketId, type: 'SYSTEM_EVENT', body: 'effects-proof', authorUserId: actorId } });
    expect(await prisma.outboxMessage.count({ where: { topic: ticketMessageDeliveryTopic, dedupeKey: message.id } })).toBe(1);

    await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS' } });
    expect(await prisma.outboxMessage.count({ where: { topic: ticketSlaEffectsTopic, payload: { path: ['ticketId'], equals: ticketId } } as never })).toBe(1);

    await expect(prisma.$transaction(async (transaction) => {
      await transaction.ticketMessage.create({ data: { ticketId, type: 'SYSTEM_EVENT', body: 'must-rollback', authorUserId: actorId } });
      await transaction.ticket.update({ where: { id: ticketId }, data: { priority: 'HIGH' } });
      throw new Error('INJECTED_AFTER_DURABLE_INTENTS');
    })).rejects.toThrow('INJECTED_AFTER_DURABLE_INTENTS');

    expect(await prisma.ticketMessage.count({ where: { ticketId, body: 'must-rollback' } })).toBe(0);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).priority).toBe('LOW');
    expect(await prisma.outboxMessage.count({ where: { topic: ticketSlaEffectsTopic, payload: { path: ['ticketId'], equals: ticketId } } as never })).toBe(1);
  });
});
