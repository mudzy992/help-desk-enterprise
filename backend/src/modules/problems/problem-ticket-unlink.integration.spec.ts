import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import * as ticketEvents from '../tickets/insert-system-ticket-event';
import { ProblemTicketsService } from './problem-tickets.service';
import { mapProblemError } from './map-problem-error';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { defaultTicketConfidentialConfiguration } from '../tickets/confidential/confidential.constants';
import { ProblemsService } from './problems.service';
import { ProblemResolutionService } from './problem-resolution.service';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { loadProblemReportData } from '../reports/packs/load-problem-report-data';

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
  let otherProblemId: string;
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
    const sequence = Date.now() % 1_999_999_999;
    problemId = (await prisma.problem.create({ data: { sequence, title: 'Problem', description: 'Integration', organizationalUnitId: unitId } })).id;
    otherProblemId = (await prisma.problem.create({ data: { sequence: sequence + 1, title: 'Other problem', description: 'Integration', organizationalUnitId: unitId } })).id;
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

  it.each(['ticket', 'problem'] as const)('rechecks a concurrently changed %s after the row lock', async (target) => {
    let release!: () => void;
    let ready!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const update = prisma.$transaction(async (tx) => {
      if (target === 'ticket') await tx.ticket.update({ where: { id: ticketId }, data: { status: 'ARCHIVED' } });
      else await tx.problem.update({ where: { id: problemId }, data: { status: 'CLOSED' } });
      ready();
      await held;
    });
    await locked;
    const unlink = service.unlink(problemId, ticketId, viewer(staffId));
    const result = unlink.then(() => null, (error: unknown) => error);
    release();
    await update;
    expect(await result).toMatchObject({ code: target === 'ticket' ? problemErrorCodes.ticketNotFound : problemErrorCodes.problemNotOpen });
    await unchanged();
  });

  it('does not delete a link concurrently moved to another problem', async () => {
    let release!: () => void;
    let ready!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const move = prisma.$transaction(async (tx) => {
      await tx.problemTicket.update({ where: { ticketId }, data: { problemId: otherProblemId } });
      ready();
      await held;
    });
    await locked;
    const result = service.unlink(problemId, ticketId, viewer(staffId)).then(() => null, (error: unknown) => error);
    release();
    await move;
    expect(await result).toMatchObject({ code: problemErrorCodes.ticketNotLinked });
    expect(await prisma.problemTicket.findUnique({ where: { ticketId } })).toMatchObject({ problemId: otherProblemId });
    expect(await prisma.problemEvent.count({ where: { problemId } })).toBe(0);
    expect(await prisma.ticketMessage.count({ where: { ticketId } })).toBe(0);
    expect(hub.publish).not.toHaveBeenCalled();
  });

  it('lists and counts only tickets visible under the canonical confidentiality policy', async () => {
    const hidden = await prisma.ticket.create({ data: { ticketNumber: `SECRET-${stamp}`, title: 'Secret', description: 'Integration', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS', serviceId, formVersionId: formId, requesterId, originUnitId: unitId, isConfidential: true } as never });
    try {
      await prisma.problemTicket.create({ data: { problemId, ticketId: hidden.id } });
      const access = { require: async () => ({ all: true, paths: [] }) };
      const loader = { loadBySubjectId: async (subjectId: string) => ({ subjectId, isLocalOnly: false, isSuperAdmin: subjectId === staffId, assignments: [] }) };
      const policies = { bind: async () => ({ confidential: defaultTicketConfidentialConfiguration }) };
      const listing = new ProblemTicketsService(prisma as never, access as never, loader as never, policies as never, hub as never);
      const staff = await listing.listForProblem(problemId, viewer(staffId));
      expect(staff.total).toBe(1);
      expect(staff.open).toBe(1);
      expect(staff.items.map((item) => item.id)).toEqual([ticketId]);
      const requester = await listing.listForProblem(problemId, viewer(requesterId));
      expect(requester.total).toBe(2);
      expect(requester.items.map((item) => item.id)).toEqual(expect.arrayContaining([ticketId, hidden.id]));
      const foreign = await listing.listForProblem(problemId, viewer(foreignId));
      expect(foreign).toEqual({ total: 0, open: 0, items: [] });
      const problemAccess = {
        ...access,
        configuration: async () => ({ numberPrefix: 'P-' }),
        hasPermission: () => false,
      };
      const problems = new ProblemsService(prisma as never, problemAccess as never, loader as never, policies as never, {} as never);
      for (const [actor, expected] of [[staffId, 1], [requesterId, 2], [foreignId, 0]] as const) {
        const detail = await problems.get(viewer(actor), problemId);
        expect(detail.ticketCount).toBe(expected);
        const page = await problems.list(viewer(actor), { search: 'Problem', limit: 100 });
        expect(page.items.find((item) => item.id === problemId)).toMatchObject({ ticketCount: expected, openTicketCount: expected });
      }
      await prisma.problemEvent.createMany({ data: [
        { problemId, action: 'ticket_linked', detail: { ticketId, ticketNumber: 'PUBLIC', recurrence: true } },
        { problemId, action: 'ticket_linked', detail: { ticketId: hidden.id, ticketNumber: 'SECRET', recurrence: true } },
        { problemId, action: 'tickets_resolved', detail: { resolved: 2 } },
        { problemId, action: 'created', detail: {} },
      ] });
      const staffEvents = await problems.events(viewer(staffId), problemId);
      expect(staffEvents.items.map((item) => item.action).sort()).toEqual(['created', 'ticket_linked']);
      const requesterEvents = await problems.events(viewer(requesterId), problemId);
      expect(requesterEvents.items.map((item) => item.action).sort()).toEqual(['created', 'ticket_linked', 'ticket_linked']);
      const foreignEvents = await problems.events(viewer(foreignId), problemId);
      expect(foreignEvents.items.map((item) => item.action)).toEqual(['created']);
      const resolverAccess = { ...problemAccess, hasPermission: () => true, requireGroupAuthority: async () => undefined, configuration: async () => ({ numberPrefix: 'P-', bulkResolveMax: 200 }) };
      const resolver = new ProblemResolutionService(prisma as never, resolverAccess as never, loader as never, policies as never, { load: async () => ({ enabled: false }) } as never, {} as never);
      const preview = await resolver.resolvePreview(problemId, viewer(staffId));
      expect(preview.items.map((item) => item.id)).toEqual([ticketId]);
      const visibility = { problem: {}, ticket: await problemTicketVisibility(prisma as never, loader as never, policies as never, staffId) };
      const window = { from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) };
      const top = await loadProblemReportData(prisma as never, { unitIds: [unitId], part: 'top', window, now: new Date(), visibility });
      expect(top.top.find((item) => item.title === 'Problem')).toMatchObject({ ticketsTotal: 1, ticketsInPeriod: 1, openTickets: 1 });
      const recurrence = await loadProblemReportData(prisma as never, { unitIds: [unitId], part: 'recurrence', window, now: new Date(), visibility });
      expect(recurrence.recurrence.filter((item) => item.title === 'Problem')).toHaveLength(1);
    } finally {
      await prisma.problemTicket.deleteMany({ where: { ticketId: hidden.id } });
      await prisma.ticket.delete({ where: { id: hidden.id } });
    }
  });

  it('maps inaccessible targets to the existing not-found HTTP contract', () => {
    const error = mapProblemError(new ProblemError(problemErrorCodes.ticketNotFound)) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({ code: problemErrorCodes.ticketNotFound });
  });
});
