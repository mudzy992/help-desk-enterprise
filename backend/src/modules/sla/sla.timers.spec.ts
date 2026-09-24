import { computeElapsedSlaMinutes } from './compute-elapsed-sla-minutes';
import { loadTicketSlaState } from './persist-ticket-sla-state';
import { standardWeeklyHours } from './sla.constants';
import { syncTicketSlaTimers } from './sync-ticket-sla-timers';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { seedTicketsSlaTimers } from '../tickets/seed-tickets-sla-timers';
import { vpnCreateInput } from '../tickets/vpn-create-input';
import type { TicketSlaTicketRef } from './ticket-sla.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const pauseAt = new Date('2026-09-11T12:20:00.000Z');
const resumeAt = new Date('2026-09-14T06:00:00.000Z');
const secondPauseAt = new Date('2026-09-14T06:15:00.000Z');
const secondResumeAt = new Date('2026-09-14T07:00:00.000Z');
const breachAt = new Date('2026-09-11T13:30:00.000Z');
const calendar = {
  timezone: 'Europe/Sarajevo',
  weeklyHours: standardWeeklyHours,
  holidays: [] as const,
};

// The SLA clocks start from the ticket's `createdAt`, which the harness takes
// from the wall clock. Freezing "now" keeps these assertions on the fixed
// 2026-09-11 business window instead of drifting with the real date.
describe('ticket SLA timers', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-11T12:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts response and resolution clocks from the matching rule', async () => {
    const { prisma, ticket } = await createStartedTicket();
    const state = await loadTicketSlaState(prisma, ticket.id);
    expect(state?.pausedAt).toBeNull();
    expect(state?.responseMinutes).toBe(60);
    expect(state?.responseDueAt?.toISOString()).toBe('2026-09-11T13:00:00.000Z');
  });

  it('pauses, resumes, and accumulates multiple pause cycles', async () => {
    const { prisma, ticket, configuration } = await createStartedTicket();
    await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'WAITING_FOR_USER'),
      previousStatus: ticket.status,
      now: pauseAt,
      event: 'status_changed',
      configuration,
    });
    let state = await loadTicketSlaState(prisma, ticket.id);
    expect(state?.pausedAt?.toISOString()).toBe(pauseAt.toISOString());
    await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'IN_PROGRESS'),
      previousStatus: 'WAITING_FOR_USER',
      now: resumeAt,
      event: 'user_resumed',
      configuration,
    });
    state = await loadTicketSlaState(prisma, ticket.id);
    expect(state?.pausedAt).toBeNull();
    expect(state?.pausedBusinessMinutes).toBe(100);
    expect(state?.responseDueAt?.toISOString()).toBe('2026-09-14T06:40:00.000Z');
    await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'WAITING_FOR_USER'),
      previousStatus: 'IN_PROGRESS',
      now: secondPauseAt,
      event: 'status_changed',
      configuration,
    });
    await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'IN_PROGRESS'),
      previousStatus: 'WAITING_FOR_USER',
      now: secondResumeAt,
      event: 'user_resumed',
      configuration,
    });
    state = await loadTicketSlaState(prisma, ticket.id);
    expect(state?.pausedBusinessMinutes).toBe(145);
    expect(state?.respondedAt).toBeNull();
    expect(computeElapsedSlaMinutes(calendar, state!, secondResumeAt).responseMinutes).toBe(35);
  });

  it('marks response and resolution expiry while running', async () => {
    const { prisma, ticket, configuration } = await createStartedTicket();
    const breached = await syncTicketSlaTimers(prisma, {
      ticket,
      now: breachAt,
      event: 'status_changed',
      configuration,
    });
    expect(breached?.isResponseBreached).toBe(true);
    expect(breached?.isResolutionBreached).toBe(false);
    const resolved = await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'RESOLVED'),
      previousStatus: ticket.status,
      now: new Date('2026-09-16T12:00:00.000Z'),
      event: 'status_changed',
      configuration,
    });
    expect(resolved?.isResolutionBreached).toBe(true);
    expect(resolved?.resolutionCompletedAt).not.toBeNull();
  });
});

async function createStartedTicket() {
  const harness = createTicketsServiceHarness();
  await seedTicketsSlaTimers(harness);
  const created = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return {
    prisma: harness.memory.prisma as never,
    ticket: harness.memory.tickets.get(created.id)!,
    configuration: { ...harness.slaConfig },
  };
}

function withStatus(
  ticket: TicketSlaTicketRef,
  status: TicketSlaTicketRef['status'],
): TicketSlaTicketRef {
  return { ...ticket, status };
}
