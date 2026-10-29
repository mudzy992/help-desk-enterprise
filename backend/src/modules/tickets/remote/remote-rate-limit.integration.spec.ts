import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { ticketSystemEventActions } from '../collaboration.constants';
import { requestTicketRemote } from './request-ticket-remote';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('remote request atomic rate-limit window', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let ticketId: string;
  let requesterId: string;
  let agentId: string;
  const stamp = Date.now();
  const auth = {
    loadBySubjectId: async (subjectId: string) => ({
      subjectId,
      isLocalOnly: false,
      isSuperAdmin: true,
      assignments: [],
    }),
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({ data: { name: `Remote ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=REM${stamp}`, ouPath: `/rem${stamp}` } });
    const category = await prisma.serviceCategory.create({ data: { name: `Remote ${stamp}`, slug: `rem-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Remote ${stamp}`, slug: `rem-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const requester = await prisma.user.create({ data: { email: `remote-requester-${stamp}@example.test`, displayName: 'Remote requester' } });
    const agent = await prisma.user.create({ data: { email: `remote-agent-${stamp}@example.test`, displayName: 'Remote agent' } });
    requesterId = requester.id;
    agentId = agent.id;
    const ticket = await prisma.ticket.create({ data: { ticketNumber: `REM-${stamp}`, title: 'Atomic remote request', description: 'proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS', serviceId: service.id, formVersionId: form.id, requesterId: requester.id, originUnitId: unit.id } as never });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, agentId] } } });
    await prisma.$disconnect();
  });

  it('allows exactly one of parallel requests inside the same ticket window', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () =>
      requestTicketRemote(prisma as never, auth as never, ticketId, { actorUserId: agentId }, { enabled: true, rateLimitMinutes: 10 }),
    ));
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(11);
    expect(await prisma.ticketMessage.count({ where: { ticketId, type: 'SYSTEM_EVENT', body: ticketSystemEventActions.remoteRequested } })).toBe(1);
  });
});
