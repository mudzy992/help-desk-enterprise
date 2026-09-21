import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { buildTicketRecord } from './list/ticket-record-fixture';
import type { TicketListResponse, TicketResponse } from './tickets.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { agentIt, agentHr, requester, superAdmin } = ticketsTestIds;
const day = (n: number) => new Date(`2026-01-0${n}T00:00:00.000Z`);

function setup() {
  const harness = createTicketsServiceHarness();
  const { memory } = harness;
  const seed = (
    n: number,
    overrides: Parameters<typeof buildTicketRecord>[0] extends infer T
      ? Partial<T>
      : never,
  ) =>
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
  seed(1, { title: 'Printer jam', priority: 'LOW' });
  seed(2, {
    title: 'VPN down',
    priority: 'MEDIUM',
    status: 'ASSIGNED',
    assignedUserId: ticketsTestIds.agentItPeer,
    assignedGroupId: ticketsTestIds.groupIt,
  });
  seed(3, {
    title: 'Laptop fan',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assignedUserId: agentIt,
  });
  seed(4, { title: 'Vpn slow', priority: 'CRITICAL' });
  seed(5, { title: 'Old', status: 'ARCHIVED' });
  seed(6, { title: 'Access', description: 'mentions vpn only here', priority: 'LOW' });
  seed(7, {
    title: 'HR onboarding',
    originUnitId: ticketsTestIds.ouHr,
    requesterId: ticketsTestIds.watcher,
  });
  const sla = (n: number, due: number, flags: object) =>
    memory.slaStates.set(`s${n}`, {
      id: `s${n}`,
      ticketId: `t${n}`,
      slaProfileId: null,
      slaRuleId: null,
      responseMinutes: 0,
      resolutionMinutes: 0,
      startedAt: day(1),
      responseDueAt: null,
      resolutionDueAt: day(due),
      respondedAt: null,
      resolutionCompletedAt: null,
      pausedAt: null,
      pausedBusinessMinutes: 0,
      isResponseBreached: false,
      isResolutionBreached: false,
      isResponseAtRisk: false,
      isResolutionAtRisk: false,
      firedEscalationKeys: [],
      updatedAt: day(1),
      ...flags,
    });
  // Both flags set: a breached ticket is overdue, never "at risk".
  sla(2, 9, { isResolutionBreached: true, isResolutionAtRisk: true });
  sla(3, 7, { isResolutionAtRisk: true });
  sla(4, 8, {});

  const page = async (
    query: Parameters<typeof harness.tickets.list>[0],
    actor: string = agentIt,
  ) =>
    (await harness.tickets.list(query, {
      actorUserId: actor,
    })) as TicketListResponse;
  const ids = (result: TicketListResponse) =>
    result.items.map((item: TicketResponse) => item.id);
  return { ...harness, page, ids };
}

describe('GET /tickets paging, sorting and filters', () => {
  it('keeps returning a plain array when no paging is requested', async () => {
    const { tickets } = setup();
    const result = await tickets.list({}, { actorUserId: agentIt });
    expect(Array.isArray(result)).toBe(true);
    // t5 is archived and t7 belongs to HR: neither is listed.
    expect((result as TicketResponse[]).map((item) => item.id).sort()).toEqual([
      't1', 't2', 't3', 't4', 't6',
    ]);
  });

  it('returns one page with the total across pages', async () => {
    const { page, ids } = setup();
    const first = await page({ page: 1, pageSize: 2, sort: 'createdAt', dir: 'asc' });
    expect(ids(first)).toEqual(['t1', 't2']);
    expect(first).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    const third = await page({ page: 3, pageSize: 2, sort: 'createdAt', dir: 'asc' });
    expect(ids(third)).toEqual(['t6']);
    const beyond = await page({ page: 4, pageSize: 2, sort: 'createdAt', dir: 'asc' });
    expect(ids(beyond)).toEqual([]);
    expect(beyond.total).toBe(5);
  });

  it('applies paging defaults and never returns more than the maximum page size', async () => {
    const { page } = setup();
    expect(await page({ page: 1 })).toMatchObject({ page: 1, pageSize: 25 });
    expect(await page({ pageSize: 10 })).toMatchObject({ page: 1, pageSize: 10 });
    expect((await page({ page: 1, pageSize: 500 })).pageSize).toBe(100);
    expect((await page({ page: 0, pageSize: 0 }))).toMatchObject({ page: 1, pageSize: 1 });
  });

  it('sorts by priority and by the closest SLA deadline, tickets without an SLA last', async () => {
    const { page, ids } = setup();
    expect(ids(await page({ page: 1, sort: 'priority', dir: 'desc' })).slice(0, 3)).toEqual([
      't4', 't3', 't2',
    ]);
    // due: t3 day 7, t4 day 8, t2 day 9; t1 and t6 have no SLA state.
    expect(ids(await page({ page: 1, sort: 'slaDueAt', dir: 'asc' }))).toEqual([
      't3', 't4', 't2', 't6', 't1',
    ]);
  });

  it('narrows by status list, assignment, group, search and SLA state', async () => {
    const { page, ids } = setup();
    expect(ids(await page({ page: 1, status: ['PENDING', 'ASSIGNED'], sort: 'createdAt', dir: 'asc' }))).toEqual([
      't1', 't2', 't4', 't6',
    ]);
    expect(ids(await page({ page: 1, unassigned: true, sort: 'createdAt', dir: 'asc' }))).toEqual([
      't1', 't4', 't6',
    ]);
    expect(ids(await page({ page: 1, groupId: ticketsTestIds.groupIt }))).toEqual(['t2']);
    // Search matches number and title, not the description.
    expect(ids(await page({ page: 1, q: 'vpn', sort: 'createdAt', dir: 'asc' }))).toEqual(['t2', 't4']);
    expect(ids(await page({ page: 1, q: 't-3' }))).toEqual(['t3']);
    expect(ids(await page({ page: 1, overdue: true }))).toEqual(['t2']);
    expect(ids(await page({ page: 1, atRisk: true }))).toEqual(['t3']);
  });

  it('reports a total that only counts what the caller may see', async () => {
    const { page, ids } = setup();
    const hr = await page({ page: 1 }, agentHr);
    expect(ids(hr)).toEqual(['t7']);
    expect(hr.total).toBe(1);
    // The requester of t7 sees only their own ticket.
    const watcher = await page({ page: 1 }, ticketsTestIds.watcher);
    expect(ids(watcher)).toEqual(['t7']);
    // Everyone else's tickets of the requester: t1-t4, t6 (t5 archived).
    expect((await page({ page: 1 }, requester)).total).toBe(5);
  });

  it('shows the archive only where the archive policy and role allow it', async () => {
    const { page, ids } = setup();
    expect(ids(await page({ page: 1, status: 'ARCHIVED' }, superAdmin))).toEqual(['t5']);
    const asAgent = await page({ page: 1, status: ['ARCHIVED', 'PENDING'], sort: 'createdAt', dir: 'asc' });
    // Whether the agent may search the archive is a policy switch; either way
    // the plain PENDING tickets are there.
    expect(ids(asAgent)).toEqual(expect.arrayContaining(['t1', 't4', 't6']));
  });
});
