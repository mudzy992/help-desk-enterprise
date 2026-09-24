import { ForbiddenException } from '@nestjs/common';

// The generated Prisma client is not resolvable inside jest; the in-memory
// harness replaces it anyway (same stub as the other ticket harness specs).
jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
import type { TicketSlaStateRecord } from '../sla/ticket-sla.types';
import { defaultTicketArchiveConfiguration } from '../tickets/archive/archive.constants';
import { defaultReportsTimeZone } from '../settings/definitions/reports-settings';
import { createTicketsServiceHarness } from '../tickets/create-tickets-service-harness';
import { listTicketsPage } from '../tickets/list-tickets';
import { buildTicketRecord } from '../tickets/list/ticket-record-fixture';
import { ticketsTestIds } from '../tickets/tickets-test-ids';
import type { SettingsService } from '../settings/settings.service';
import type { ReportSummaryCache } from './report-summary.cache';
import { ReportSummaryService } from './report-summary.service';
import type {
  DashboardSummaryResponse,
  SlaSummaryResponse,
} from './summary/report-summary.types';

const now = new Date('2026-09-24T10:00:00.000Z');

type World = ReturnType<typeof createTicketsServiceHarness>;

function createFakeCache() {
  const store = new Map<string, unknown>();
  // Same shape as `dashboardSummaryCacheKey`: the reporting zone is part of the
  // key, so a payload must not survive a change of the day boundary.
  const dashboardKey = (userId: string, scope: string, timeZone: string) =>
    `dashboard:${userId}:${scope}:${timeZone}`;
  const cache: ReportSummaryCache = {
    readDashboardSummary: async (userId: string, scope: string, timeZone: string) =>
      (store.get(dashboardKey(userId, scope, timeZone)) as DashboardSummaryResponse) ??
      null,
    writeDashboardSummary: async (
      userId: string,
      summary: DashboardSummaryResponse,
      timeZone: string,
    ) => {
      store.set(dashboardKey(userId, summary.scope, timeZone), summary);
    },
    readSlaSummary: async (userId: string) =>
      (store.get(`sla:${userId}`) as SlaSummaryResponse) ?? null,
    writeSlaSummary: async (userId: string, summary: SlaSummaryResponse) => {
      store.set(`sla:${userId}`, summary);
    },
  } as unknown as ReportSummaryCache;
  return { cache, store };
}

function createService(world: World, settingsTimeZone?: string) {
  const { cache, store } = createFakeCache();
  return {
    store,
    service: new ReportSummaryService(
      world.memory.prisma as never,
      world.authorizationContextLoader as never,
      cache,
      settingsTimeZone === undefined
        ? undefined
        : ({
            getSetting: async () => settingsTimeZone,
          } as unknown as SettingsService),
    ),
  };
}

function seedState(
  overrides: Partial<TicketSlaStateRecord> & { readonly id: string; readonly ticketId: string },
): TicketSlaStateRecord {
  return {
    slaProfileId: 'profile-standard',
    slaRuleId: null,
    responseMinutes: 60,
    resolutionMinutes: 480,
    startedAt: new Date('2026-09-20T08:00:00.000Z'),
    responseDueAt: new Date('2026-09-20T09:00:00.000Z'),
    resolutionDueAt: new Date('2026-09-20T16:00:00.000Z'),
    respondedAt: null,
    resolutionCompletedAt: null,
    pausedAt: null,
    pausedBusinessMinutes: 0,
    isResponseBreached: false,
    isResolutionBreached: false,
    isResponseAtRisk: false,
    isResolutionAtRisk: false,
    firedEscalationKeys: [],
    nextDueAt: null,
    updatedAt: now,
    ...overrides,
  };
}

/** Tickets: two for the requester (one still open, one closed), one IT ticket
 *  for the watcher and one HR ticket nobody outside HR can see. */
function seedTickets(world: World) {
  world.memory.tickets.set(
    't-open',
    buildTicketRecord({
      id: 't-open',
      status: 'PENDING',
      priority: 'HIGH',
      requesterId: ticketsTestIds.requester,
      createdAt: now,
    }),
  );
  world.memory.tickets.set(
    't-closed',
    buildTicketRecord({
      id: 't-closed',
      status: 'CLOSED',
      requesterId: ticketsTestIds.requester,
      createdAt: new Date('2026-09-20T09:00:00.000Z'),
      resolvedAt: new Date('2026-09-21T09:00:00.000Z'),
      closedAt: new Date('2026-09-21T09:00:00.000Z'),
    }),
  );
  world.memory.tickets.set(
    't-it',
    buildTicketRecord({
      id: 't-it',
      status: 'IN_PROGRESS',
      requesterId: ticketsTestIds.watcher,
      assignedUserId: ticketsTestIds.agentIt,
      createdAt: new Date('2026-09-20T09:00:00.000Z'),
    }),
  );
  world.memory.tickets.set(
    't-hr',
    buildTicketRecord({
      id: 't-hr',
      status: 'PENDING',
      originUnitId: ticketsTestIds.ouHr,
      serviceId: ticketsTestIds.serviceAccess,
      requesterId: ticketsTestIds.watcher,
      createdAt: new Date('2026-09-20T09:00:00.000Z'),
    }),
  );
}

/** The SLA states behind those tickets. */
function seedSlaStates(world: World) {
  world.memory.slaStates.set(
    'sla-open',
    seedState({ id: 'sla-open', ticketId: 't-open', isResponseAtRisk: true }),
  );
  world.memory.slaStates.set(
    'sla-it',
    seedState({ id: 'sla-it', ticketId: 't-it', isResolutionBreached: true }),
  );
  world.memory.slaStates.set(
    'sla-closed',
    seedState({
      id: 'sla-closed',
      ticketId: 't-closed',
      isResolutionBreached: true,
      resolutionCompletedAt: new Date('2026-09-21T09:00:00.000Z'),
    }),
  );
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) {
    return '<date>';
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

describe('ReportSummaryService', () => {
  it('answers the dashboard with the numbers of the visible list', async () => {
    const world = createTicketsServiceHarness();
    seedTickets(world);
    const { service } = createService(world);

    const page = await listTicketsPage(
      world.memory.prisma as never,
      world.authorizationContextLoader as never,
      {},
      { actorUserId: ticketsTestIds.requester },
      defaultTicketArchiveConfiguration,
    );
    const summary = await service.loadDashboardSummary({
      actorUserId: ticketsTestIds.requester,
      scope: 'all',
      now,
    });

    expect(page.total).toBe(2);
    expect(summary.total).toBe(page.total);
    expect(summary.statusCounts).toEqual([
      { status: 'PENDING', count: 1 },
      { status: 'CLOSED', count: 1 },
    ]);
    expect(summary.requestedByMe).toBe(2);
    expect(summary.assignedToMe).toBe(0);
    expect(summary.openedToday).toBe(1);
    expect(summary.scope).toBe('all');
    expect(summary.generatedAt).toBe(now.toISOString());
  });

  it('builds the counters on the same where as the list', async () => {
    const world = createTicketsServiceHarness();
    seedTickets(world);
    const { service } = createService(world);
    const findMany = jest.spyOn(world.memory.prisma.ticket, 'findMany');
    const groupBy = jest.spyOn(world.memory.prisma.ticket, 'groupBy');

    await listTicketsPage(
      world.memory.prisma as never,
      world.authorizationContextLoader as never,
      {},
      { actorUserId: ticketsTestIds.agentIt },
      defaultTicketArchiveConfiguration,
    );
    await service.loadDashboardSummary({
      actorUserId: ticketsTestIds.agentIt,
      scope: 'all',
      now,
    });

    const listWhere = (findMany.mock.calls[0]?.[0] as { where: unknown }).where;
    const summaryWhere = (groupBy.mock.calls[0]?.[0] as { where: unknown }).where;
    expect(normalize(summaryWhere)).toEqual(normalize(listWhere));
  });

  it('narrows a scope exactly like the matching list view', async () => {
    const world = createTicketsServiceHarness();
    seedTickets(world);
    const { service } = createService(world);

    const page = await listTicketsPage(
      world.memory.prisma as never,
      world.authorizationContextLoader as never,
      { assignedUserId: ticketsTestIds.agentIt },
      { actorUserId: ticketsTestIds.agentIt },
      defaultTicketArchiveConfiguration,
    );
    const summary = await service.loadDashboardSummary({
      actorUserId: ticketsTestIds.agentIt,
      scope: 'assignedToMe',
      now,
    });

    // Only the IT ticket is assigned to the agent, and it is the only one that
    // is both visible and assigned — exactly what the view lists.
    expect(summary.total).toBe(1);
    expect(summary.total).toBe(page.total);
    expect(summary.assignedToMe).toBe(1);
    expect(summary.requestedByMe).toBe(0);
  });

  it('serves the second call from the cache without querying again', async () => {
    const world = createTicketsServiceHarness();
    seedTickets(world);
    const { service, store } = createService(world);
    const groupBy = jest.spyOn(world.memory.prisma.ticket, 'groupBy');

    const first = await service.loadDashboardSummary({
      actorUserId: ticketsTestIds.requester,
      scope: 'all',
      now,
    });
    const callsAfterFirst = groupBy.mock.calls.length;
    const second = await service.loadDashboardSummary({
      actorUserId: ticketsTestIds.requester,
      scope: 'all',
      now,
    });

    expect(callsAfterFirst).toBe(2);
    expect(groupBy.mock.calls.length).toBe(callsAfterFirst);
    expect(second).toEqual(first);
    // No settings service in this construction: the installation default zone.
    expect(
      store.get(`dashboard:${ticketsTestIds.requester}:all:${defaultReportsTimeZone}`),
    ).toEqual(first);
  });

  it('bounds "opened today" with the zone from the settings, not the process', async () => {
    const world = createTicketsServiceHarness();
    seedTickets(world);
    // One spy for the whole test: a second `jest.spyOn` would return this same
    // mock with the calls of every earlier round still in it.
    const count = jest.spyOn(world.memory.prisma.ticket, 'count');
    const openedTodayClauseFor = async (settingsTimeZone?: string) => {
      count.mockClear();
      const { service } = createService(world, settingsTimeZone);
      await service.loadDashboardSummary({
        actorUserId: ticketsTestIds.requester,
        scope: 'all',
        now,
      });
      // Calls in order: critical, openedToday, unassigned, assignedToMe,
      // requestedByMe, overdue.
      return (count.mock.calls[1]?.[0] as { where: { AND: readonly unknown[] } })
        .where.AND[1];
    };

    await expect(openedTodayClauseFor('UTC')).resolves.toEqual({
      createdAt: { gte: new Date('2026-09-24T00:00:00.000Z') },
    });
    await expect(openedTodayClauseFor('Europe/Sarajevo')).resolves.toEqual({
      createdAt: { gte: new Date('2026-09-23T22:00:00.000Z') },
    });
    // Nothing configured (or no settings service in the graph) → the default.
    expect(defaultReportsTimeZone).toBe('Europe/Sarajevo');
    await expect(openedTodayClauseFor(undefined)).resolves.toEqual({
      createdAt: { gte: new Date('2026-09-23T22:00:00.000Z') },
    });
  });

  it('rejects an actor without an authorization context', async () => {
    const world = createTicketsServiceHarness();
    const { service } = createService(world);

    await expect(
      service.loadDashboardSummary({ actorUserId: 'user-ghost', scope: 'all', now }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('counts the SLA exposure of the open, visible tickets', async () => {
    const world = createTicketsServiceHarness();
    seedTickets(world);
    seedSlaStates(world);
    const { service } = createService(world);
    const groupBy = jest.spyOn(world.memory.prisma.ticketSlaState, 'groupBy');

    const summary = await service.loadSlaSummary({
      actorUserId: ticketsTestIds.agentIt,
      now,
    });

    // Two visible open tickets (the requester's pending one and the IT one); the
    // breached state of the closed ticket is not "exposure".
    expect(summary.totals).toEqual({ open: 2, onTrack: 0, atRisk: 1, breached: 1 });
    expect(summary.profiles).toEqual([
      {
        slaProfileId: 'profile-standard',
        exposure: { open: 2, onTrack: 0, atRisk: 1, breached: 1 },
        priorities: [
          {
            priority: 'MEDIUM',
            exposure: { open: 1, onTrack: 0, atRisk: 0, breached: 1 },
          },
          {
            priority: 'HIGH',
            exposure: { open: 1, onTrack: 0, atRisk: 1, breached: 0 },
          },
        ],
      },
    ]);

    // The scope of every group is the list where plus the open-status clause.
    const scoped = (
      groupBy.mock.calls[0]?.[0] as unknown as {
        where: { ticket: { is: { AND: readonly unknown[] } } };
      }
    ).where.ticket.is.AND;
    const openTicketWhere = scoped[0] as { readonly AND: readonly unknown[] };
    const findMany = jest.spyOn(world.memory.prisma.ticket, 'findMany');
    await listTicketsPage(
      world.memory.prisma as never,
      world.authorizationContextLoader as never,
      {},
      { actorUserId: ticketsTestIds.agentIt },
      defaultTicketArchiveConfiguration,
    );
    const listWhere = (findMany.mock.calls[0]?.[0] as { where: unknown }).where;
    expect(normalize(openTicketWhere.AND[0])).toEqual(normalize(listWhere));
  });
});
