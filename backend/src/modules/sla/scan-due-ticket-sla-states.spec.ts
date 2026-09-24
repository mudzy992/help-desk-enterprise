import { scanDueTicketSlaStates } from './scan-due-ticket-sla-states';
import { loadTicketSlaState } from './persist-ticket-sla-state';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { seedTicketsSlaTimers } from '../tickets/seed-tickets-sla-timers';
import { vpnCreateInput } from '../tickets/vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const responseBreachOffsetMs = 3 * 60 * 60 * 1000;

/**
 * Phase 2.1 (plan §2.1): the scan is a bounded batch of *due* states instead of
 * "every open state, one ticket query each".
 */
describe('scanDueTicketSlaStates batching', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-11T12:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function createWorld(ticketCount: number) {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    const tickets = [];
    for (let index = 0; index < ticketCount; index += 1) {
      const created = await harness.tickets.create(vpnCreateInput(), {
        actorUserId: ticketsTestIds.requester,
      });
      tickets.push(harness.memory.tickets.get(created.id)!);
    }
    return {
      harness,
      tickets,
      countQueries: wrapWithQueryCounters(harness),
      configuration: { ...harness.slaConfig },
    };
  }

  it('reads the due states and their tickets in two queries, not one per state', async () => {
    const world = await createWorld(3);
    const breachAt = new Date(
      world.tickets[0].createdAt.getTime() + responseBreachOffsetMs,
    );

    const scanned = await scanDueTicketSlaStates(world.countQueries.prisma as never, {
      configuration: world.configuration,
      now: breachAt,
    });

    expect(scanned).toHaveLength(3);
    expect(scanned.every((state) => state.isResponseBreached)).toBe(true);
    // One bounded read for the due states, one for their tickets, and no
    // per-state ticket lookup at all.
    expect(world.countQueries.counts.slaStateFindMany).toBe(1);
    expect(world.countQueries.counts.ticketFindMany).toBe(1);
    // Whatever is read per state from here on belongs to the runtime events
    // that were just recorded (each one loads the ticket for its realtime
    // payload) — the batch loading itself is two queries.
    const afterFirstScan = world.countQueries.counts.ticketFindUnique;
    expect(afterFirstScan).toBeGreaterThan(0);

    // Second cycle, same instant: every state is up to date now, so nothing is
    // due — and the scan does not read a single ticket.
    await scanDueTicketSlaStates(world.countQueries.prisma as never, {
      configuration: world.configuration,
      now: breachAt,
    });
    expect(world.countQueries.counts.slaStateFindMany).toBe(2);
    expect(world.countQueries.counts.ticketFindMany).toBe(1);
    expect(world.countQueries.counts.ticketFindUnique).toBe(afterFirstScan);
  });

  it('does not touch states whose next transition is still in the future', async () => {
    const world = await createWorld(1);
    const beforeAtRisk = new Date(world.tickets[0].createdAt.getTime() + 5 * 60 * 1000);

    const scanned = await scanDueTicketSlaStates(world.countQueries.prisma as never, {
      configuration: world.configuration,
      now: beforeAtRisk,
    });

    expect(scanned).toEqual([]);
    expect(world.countQueries.counts.ticketFindMany).toBe(0);
    const state = await loadTicketSlaState(
      world.countQueries.prisma as never,
      world.tickets[0].id,
    );
    expect(state?.isResponseAtRisk).toBe(false);
    expect(state?.isResponseBreached).toBe(false);
    // The state is scheduled, it just is not due yet.
    expect(state?.nextDueAt?.getTime()).toBeGreaterThan(beforeAtRisk.getTime());
  });

  it('processes at most one batch and leaves the rest due for the next cycle', async () => {
    const world = await createWorld(3);
    const breachAt = new Date(
      world.tickets[0].createdAt.getTime() + responseBreachOffsetMs,
    );

    const first = await scanDueTicketSlaStates(world.countQueries.prisma as never, {
      configuration: world.configuration,
      now: breachAt,
      batchSize: 2,
    });
    expect(first).toHaveLength(2);

    // Nothing was dropped: the remaining state is still due and the next cycle
    // picks it up.
    const second = await scanDueTicketSlaStates(world.countQueries.prisma as never, {
      configuration: world.configuration,
      now: breachAt,
      batchSize: 2,
    });
    expect(second).toHaveLength(1);
  });

  it('skips a state whose ticket no longer exists', async () => {
    const world = await createWorld(1);
    const breachAt = new Date(
      world.tickets[0].createdAt.getTime() + responseBreachOffsetMs,
    );
    world.harness.memory.tickets.delete(world.tickets[0].id);

    const scanned = await scanDueTicketSlaStates(world.countQueries.prisma as never, {
      configuration: world.configuration,
      now: breachAt,
    });

    expect(scanned).toEqual([]);
  });

  it('does nothing while SLA tracking is switched off', async () => {
    const world = await createWorld(1);
    const breachAt = new Date(
      world.tickets[0].createdAt.getTime() + responseBreachOffsetMs,
    );

    const scanned = await scanDueTicketSlaStates(world.countQueries.prisma as never, {
      configuration: { ...world.configuration, enabled: false },
      now: breachAt,
    });

    expect(scanned).toEqual([]);
    expect(world.countQueries.counts.slaStateFindMany).toBe(0);
  });
});

/** Counts the reads the scan is allowed to make (the N+1 guard). */
function wrapWithQueryCounters(harness: ReturnType<typeof createTicketsServiceHarness>) {
  const prisma = harness.memory.prisma as unknown as {
    ticketSlaState: { findMany: (args?: unknown) => Promise<unknown> };
    ticket: {
      findMany: (args?: unknown) => Promise<unknown>;
      findUnique: (args: unknown) => Promise<unknown>;
    };
  };
  const counts = {
    slaStateFindMany: 0,
    ticketFindMany: 0,
    ticketFindUnique: 0,
  };
  const wrapped = {
    ...(harness.memory.prisma as unknown as Record<string, unknown>),
    ticketSlaState: {
      ...prisma.ticketSlaState,
      findMany: (args?: unknown) => {
        counts.slaStateFindMany += 1;
        return prisma.ticketSlaState.findMany(args);
      },
    },
    ticket: {
      ...prisma.ticket,
      findMany: (args?: unknown) => {
        counts.ticketFindMany += 1;
        return prisma.ticket.findMany(args);
      },
      findUnique: (args: unknown) => {
        counts.ticketFindUnique += 1;
        return prisma.ticket.findUnique(args);
      },
    },
  };
  return { prisma: wrapped, counts };
}
