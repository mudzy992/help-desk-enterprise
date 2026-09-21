import { createTicketsServiceHarness, ticketsTestIds } from '../create-tickets-service-harness';
import { defaultTicketArchiveConfiguration } from '../archive/archive.constants';
import { buildTicketRecord } from '../list/ticket-record-fixture';
import type { TicketListResponse } from '../tickets.types';
import { getTicketCounts } from './get-ticket-counts';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { agentIt, agentHr, requester, superAdmin, groupIt, ouHr } = ticketsTestIds;
const day = (n: number) => new Date(`2026-01-0${n}T00:00:00.000Z`);

function setup() {
  const harness = createTicketsServiceHarness();
  const { memory } = harness;
  memory.seedGroupMember({ groupId: groupIt, userId: agentIt });
  const seed = (n: number, overrides: Record<string, unknown>) =>
    memory.tickets.set(
      `t${n}`,
      buildTicketRecord({
        id: `t${n}`,
        ticketNumber: `T-${n}`,
        createdAt: day(n),
        updatedAt: day(n),
        ...overrides,
      }),
    );
  seed(1, { title: 'Printer jam', priority: 'LOW' }); // PENDING
  seed(2, { title: 'VPN down', status: 'ASSIGNED', assignedUserId: ticketsTestIds.agentItPeer, assignedGroupId: groupIt });
  seed(3, { title: 'Laptop fan', status: 'IN_PROGRESS', assignedUserId: agentIt, priority: 'HIGH' });
  seed(4, { title: 'Vpn slow', status: 'UNROUTED', priority: 'CRITICAL' });
  seed(5, { title: 'Old', status: 'ARCHIVED' });
  seed(6, { title: 'Done', status: 'RESOLVED', priority: 'LOW' });
  seed(7, { title: 'HR onboarding', originUnitId: ouHr, requesterId: ticketsTestIds.watcher });
  seed(8, { title: 'Queue A', assignedGroupId: groupIt }); // inbox
  seed(9, { title: 'Queue B secret', assignedGroupId: groupIt, isConfidential: true }); // inbox, confidential
  seed(10, { title: 'Confidential HR', originUnitId: ouHr, isConfidential: true, requesterId: ticketsTestIds.watcher });
  const sla = (n: number, flags: object) =>
    memory.slaStates.set(`s${n}`, {
      id: `s${n}`, ticketId: `t${n}`, slaProfileId: null, slaRuleId: null,
      responseMinutes: 0, resolutionMinutes: 0, startedAt: day(1),
      responseDueAt: null, resolutionDueAt: day(9), respondedAt: null,
      resolutionCompletedAt: null, pausedAt: null, pausedBusinessMinutes: 0,
      isResponseBreached: false, isResolutionBreached: false,
      isResponseAtRisk: false, isResolutionAtRisk: false,
      firedEscalationKeys: [], updatedAt: day(1), ...flags,
    });
  sla(2, { isResolutionBreached: true, isResolutionAtRisk: true }); // overdue only
  sla(3, { isResolutionAtRisk: true }); // at risk
  sla(6, { isResponseBreached: true }); // closed but breached: still "overdue", like the list
  sla(5, { isResolutionBreached: true }); // archived: excluded everywhere
  const counts = (query: Parameters<typeof harness.tickets.getCounts>[0], actor: string) =>
    harness.tickets.getCounts(query, { actorUserId: actor });
  const listTotal = async (query: object, actor: string) =>
    ((await harness.tickets.list({ page: 1, ...query }, { actorUserId: actor })) as TicketListResponse).total;
  return { ...harness, counts, listTotal };
}

describe('GET /tickets/counts', () => {
  it('breaks the visible tickets down by status, every status present', async () => {
    const { counts } = setup();
    const result = await counts({}, agentIt);
    expect(result.byStatus).toEqual({
      PENDING: 3, // t1, t8, t9 (t9 confidential but the caller is in its group)
      UNROUTED: 1,
      PENDING_APPROVAL: 0,
      ASSIGNED: 1,
      IN_PROGRESS: 1,
      WAITING_FOR_USER: 0,
      RESOLVED: 1,
      CLOSED: 0,
      ARCHIVED: 1,
    });
    expect(result.unrouted).toBe(1);
    // open = everything but RESOLVED, CLOSED and ARCHIVED
    expect(result.open).toBe(6);
  });

  it('agrees with the list: overdue, at risk and the per-status totals', async () => {
    const { counts, listTotal } = setup();
    const result = await counts({}, agentIt);
    expect(result.overdue).toBe(2); // t2 and t6; archived t5 is excluded
    expect(result.atRisk).toBe(1); // t3; breached t2 is overdue, never at risk
    expect(result.overdue).toBe(await listTotal({ overdue: true }, agentIt));
    expect(result.atRisk).toBe(await listTotal({ atRisk: true }, agentIt));
    for (const [status, count] of Object.entries(result.byStatus)) {
      if (status !== 'ARCHIVED') {
        expect(count).toBe(await listTotal({ status: [status] }, agentIt));
      }
    }
    // The default list hides the archive, so total = sum of all but ARCHIVED.
    const { ARCHIVED, ...listed } = result.byStatus;
    expect(ARCHIVED).toBe(1);
    expect(Object.values(listed).reduce((a, b) => a + b, 0)).toBe(await listTotal({}, agentIt));
  });

  it('counts the group inbox the same as the inbox itself', async () => {
    const { counts, tickets } = setup();
    const inbox = await tickets.listInbox({ actorUserId: agentIt });
    expect(inbox.map((ticket) => ticket.id).sort()).toEqual(['t8', 't9']);
    expect((await counts({}, agentIt)).inbox).toBe(inbox.length);
    // No group membership, no inbox.
    expect((await counts({}, agentHr)).inbox).toBe(0);
  });

  it('only counts what the caller may see, confidential tickets included', async () => {
    const { counts, listTotal } = setup();
    const hr = await counts({}, agentHr);
    // t7 is plain HR; t10 is confidential and agentHr has no confidential access.
    expect(hr.byStatus.PENDING).toBe(1);
    expect(hr.open).toBe(1);
    expect(await listTotal({}, agentHr)).toBe(1);
    // The requester of both HR tickets sees both.
    expect((await counts({}, ticketsTestIds.watcher)).byStatus.PENDING).toBe(2);
    // A requester sees only their own tickets.
    expect((await counts({}, requester)).open).toBe(
      (await listTotal({}, requester)) - 1, // minus RESOLVED t6
    );
  });

  it('narrows by the list filters, so tab counters follow the current filters', async () => {
    const { counts, listTotal } = setup();
    const low = await counts({ priority: 'LOW' }, agentIt);
    expect(low.byStatus.PENDING).toBe(1); // t1
    expect(low.byStatus.RESOLVED).toBe(1); // t6
    expect(low.open).toBe(1);
    expect(low.overdue).toBe(await listTotal({ priority: 'LOW', overdue: true }, agentIt));
    expect((await counts({ q: 'vpn' }, agentIt)).byStatus).toMatchObject({ ASSIGNED: 1, UNROUTED: 1, PENDING: 0 });
    expect((await counts({ unassigned: true }, agentIt)).byStatus.ASSIGNED).toBe(0);
    // The inbox is the caller's queue, not part of the filtered view.
    expect((await counts({ priority: 'CRITICAL' }, agentIt)).inbox).toBe(2);
  });
});

describe('getTicketCounts (direct)', () => {
  const direct = (actor: string, archive?: typeof defaultTicketArchiveConfiguration, groupInboxEnabled = true) => {
    const harness = setup();
    return getTicketCounts({
      prisma: harness.memory.prisma as never,
      authorizationContextLoader: {
        loadBySubjectId: async (id: string) => harness.contexts.get(id) ?? null,
      } as never,
      query: {},
      context: { actorUserId: actor },
      archive,
      groupInboxEnabled,
    });
  };

  it('hides the archive count unless the archive is searchable or the caller is SuperAdmin', async () => {
    const closed = { ...defaultTicketArchiveConfiguration, searchable: false };
    expect((await direct(agentIt, closed)).byStatus.ARCHIVED).toBe(0);
    expect((await direct(agentIt)).byStatus.ARCHIVED).toBe(1);
    expect((await direct(superAdmin, closed)).byStatus.ARCHIVED).toBe(1);
  });

  it('reports an empty inbox instead of failing when the group inbox is switched off', async () => {
    expect((await direct(agentIt, undefined, false)).inbox).toBe(0);
  });

  it('refuses a caller without an authorization context', async () => {
    await expect(direct('nobody')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
