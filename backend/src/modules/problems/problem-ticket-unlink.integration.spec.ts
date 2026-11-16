import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import * as ticketEvents from '../tickets/insert-system-ticket-event';
import { ProblemTicketsService } from './problem-tickets.service';
import { mapProblemError } from './map-problem-error';
import { ProblemError, problemErrorCodes } from './problems.constants';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/** Real rows and ticket policy; problem permission and identity loader are isolated fixtures. */
describeIfDatabase('problem ticket unlink authorization and transaction (BA-problems-04)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let service: ProblemTicketsService;
  let unitId: string;
  let serviceId: string;
  let formId: string;
  let requesterId: string;
  let staffId: string;
  let foreignId: string;
  let problemId: string;
  let ticketId: string;
  const stamp = `${Date.now()}-${process.pid}`;
  const hub = { publish: jest.fn(), publishTicketUpdated: jest.fn() };
  const viewer = (userId: string) => ({ userId }) as never;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({ data: { name: `Unlink ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=Unlink-${stamp}`, ouPath: `/unlink-${stamp}` } });
    unitId = unit.id;
    const category = await prisma.serviceCategory.create({ data: { name: `Unlink ${stamp}`, slug: `unlink-cat-${stamp}` } });
    const catalog = await prisma.service.create({ data: { name: `Unlink ${stamp}`, slug: `unlink-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    serviceId = catalog.id;
    formId = (await prisma.formVersion.create({ data: { serviceId, version: 1, schema: {} } })).id;
    requesterId = (await prisma.user.create({ data: { email: `unlink-requester-${stamp}@example.test`, displayName: 'Requester' } })).id;
    staffId = (await prisma.user.create({ data: { email: `unlink-staff-${stamp}@example.test`, displayName: 'Staff' } })).id;
    foreignId = (await prisma.user.create({ data: { email: `unlink-foreign-${stamp}@example.test`, displayName: 'Foreign' } })).id;
    problemId = (await prisma.problem.create({ data: { sequence: Date.now() % 2_000_000_000, title: 'Problem', description: 'Integration', organizationalUnitId: unitId } })).id;
    ticketId = (await prisma.ticket.create({ data: { ticketNumber: `UNLINK-${stamp}`, title: 'Ticket', description: 'Integration', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS', serviceId, formVersionId: formId, requesterId, originUnitId: unitId } as never })).id;
    const access = { require: jest.fn(async () => ({ all: true, paths: [] })), configuration: jest.fn(async () => ({ numberPrefix: 'P-' })) };
    const loader = { loadBySubjectId: async (subjectId: string) => ({ subjectId, isLocalOnly: false, isSuperAdmin: subjectId === staffId, assignments: [] }) };
    service = new ProblemTicketsService(prisma as never, access as never, loader as never, { bind: async (context: unknown) => context } as never, hub as never);
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await prisma.problem.update({ where: { id: problemId }, data: { status: 'INVESTIGATING' } });
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS', isConfidential: false } });
    await prisma.problemTicket.deleteMany({ where: { ticketId } });
    await prisma.problemEvent.deleteMany({ where: { problemId } });
    await prisma.ticketMessage.deleteMany({ where: { ticketId } });
    await prisma.problemTicket.create({ data: { problemId, ticketId } });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  async function unchanged() {
    expect(await prisma.problemTicket.count({ where: { problemId, ticketId } })).toBe(1);
    expect(await prisma.problemEvent.count({ where: { problemId } })).toBe(0);
    expect(await prisma.ticketMessage.count({ where: { ticketId } })).toBe(0);
    expect(hub.publish).not.toHaveBeenCalled();
  }

  it.each(['requester', 'foreign', 'confidential', 'archived'] as const)('denies %s without effects', async (kind) => {
    if (kind === 'confidential') await prisma.ticket.update({ where: { id: ticketId }, data: { isConfidential: true } });
    if (kind === 'archived') await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'ARCHIVED' } });
    const actor = kind === 'requester' ? requesterId : kind === 'foreign' ? foreignId : staffId;
    await expect(service.unlink(problemId, ticketId, viewer(actor))).rejects.toMatchObject({ code: problemErrorCodes.ticketNotFound });
    await unchanged();
  });

  it('allows staff and persists exactly one event on each record', async () => {
    await service.unlink(problemId, ticketId, viewer(staffId));
    expect(await prisma.problemTicket.count({ where: { problemId, ticketId } })).toBe(0);
    expect(await prisma.problemEvent.count({ where: { problemId, action: 'ticket_unlinked' } })).toBe(1);
    expect(await prisma.ticketMessage.count({ where: { ticketId, type: 'SYSTEM_EVENT' } })).toBe(1);
    expect(hub.publish).toHaveBeenCalledTimes(1);
  });

  it('rolls back deletion and problem event when ticket event fails', async () => {
    jest.spyOn(ticketEvents, 'insertSystemTicketEvent').mockRejectedValueOnce(new Error('injected failure'));
    await expect(service.unlink(problemId, ticketId, viewer(staffId))).rejects.toThrow('injected failure');
    await unchanged();
  });

  it('serializes competing unlinks: one succeeds, one is not linked', async () => {
    const outcomes = await Promise.allSettled([service.unlink(problemId, ticketId, viewer(staffId)), service.unlink(problemId, ticketId, viewer(staffId))]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find((result) => result.status === 'rejected');
    expect(failure).toMatchObject({ status: 'rejected', reason: { code: problemErrorCodes.ticketNotLinked } });
    expect(await prisma.problemTicket.count({ where: { problemId, ticketId } })).toBe(0);
    expect(await prisma.problemEvent.count({ where: { problemId, action: 'ticket_unlinked' } })).toBe(1);
    expect(await prisma.ticketMessage.count({ where: { ticketId, type: 'SYSTEM_EVENT' } })).toBe(1);
  });

  it('maps inaccessible targets to the existing not-found HTTP contract', () => {
    const error = mapProblemError(new ProblemError(problemErrorCodes.ticketNotFound)) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({ code: problemErrorCodes.ticketNotFound });
  });
});
