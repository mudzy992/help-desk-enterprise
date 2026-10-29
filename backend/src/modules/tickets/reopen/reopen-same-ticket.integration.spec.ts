import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { reopenSameTicket, reopenSlaOutboxTopic } from './reopen-same-ticket';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('same-ticket reopen atomic idempotent boundary', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let ticketId: string;
  let actorId: string;
  const stamp = Date.now();
  const firstKey = '10000000-0000-4000-8000-000000000031';
  const secondKey = '10000000-0000-4000-8000-000000000032';
  const auth = { loadBySubjectId: async (subjectId: string) => ({ subjectId, isLocalOnly: false, isSuperAdmin: false, assignments: [] }) };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({ data: { name: `Reopen ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=ROP${stamp}`, ouPath: `/rop${stamp}` } });
    const category = await prisma.serviceCategory.create({ data: { name: `Reopen ${stamp}`, slug: `rop-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Reopen ${stamp}`, slug: `rop-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const actor = await prisma.user.create({ data: { email: `reopen-${stamp}@example.test`, displayName: 'Reopen actor' } });
    actorId = actor.id;
    const ticket = await prisma.ticket.create({ data: { ticketNumber: `ROP-${stamp}`, title: 'Atomic reopen', description: 'proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'RESOLVED', resolvedAt: new Date(), serviceId: service.id, formVersionId: form.id, requesterId: actor.id, originUnitId: unit.id } as never });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { namespace: 'ticket.reopen.same' } });
    await prisma.outboxMessage.deleteMany({ where: { topic: reopenSlaOutboxTopic } });
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const execute = (key: string, messages: unknown[]) => reopenSameTicket({
    prisma: prisma as never,
    authorizationContextLoader: auth as never,
    configuration: { enabled: true, windowDays: 7 },
    ticketId,
    idempotencyKey: key,
    body: { comment: 'Please reopen' },
    context: { actorUserId: actorId },
    now: new Date(),
    messages: messages as never,
  });

  it('allows one parallel transition and replays the winning command without duplicate effects', async () => {
    const firstMessages: unknown[] = [];
    const secondMessages: unknown[] = [];
    const parallel = await Promise.allSettled([execute(firstKey, firstMessages), execute(secondKey, secondMessages)]);
    expect(parallel.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(parallel.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winningKey = parallel[0]?.status === 'fulfilled' ? firstKey : secondKey;
    const beforeReplayEvents = await prisma.ticketMessage.count({ where: { ticketId } });
    const replayMessages: unknown[] = [];
    expect((await execute(winningKey, replayMessages)).status).toBe('IN_PROGRESS');
    expect(replayMessages).toHaveLength(0);
    expect(await prisma.ticketMessage.count({ where: { ticketId } })).toBe(beforeReplayEvents);
    expect(await prisma.changeLog.count({ where: { entityId: ticketId, reason: 'ticket_reopened' } })).toBe(1);
    expect(await prisma.outboxMessage.count({ where: { topic: reopenSlaOutboxTopic, dedupeKey: `${winningKey}:parent` } })).toBe(1);
  });
});
