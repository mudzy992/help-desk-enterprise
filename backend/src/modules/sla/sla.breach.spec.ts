import { slaChangeLogReasons, slaSystemEventActions } from './sla.constants';
import { loadTicketSlaState } from './persist-ticket-sla-state';
import { scanDueTicketSlaStates } from './scan-due-ticket-sla-states';
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

const pauseOffsetMs = 20 * 60 * 1000;
const responseBreachOffsetMs = 3 * 60 * 60 * 1000;
const resolutionBreachOffsetMs = 10 * 24 * 60 * 60 * 1000;

// Ticket creation stamps `createdAt` from the wall clock while the assertions
// below use fixed business-hour dates, so "now" is frozen for determinism.
describe('ticket SLA breach and escalation', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-11T12:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('detects a response SLA breach on scan and keeps the flag sticky', async () => {
    const { prisma, ticket, configuration, memory } = await createStartedTicket();
    const responseBreachAt = new Date(ticket.createdAt.getTime() + responseBreachOffsetMs);
    const scanned = await scanDueTicketSlaStates(prisma, {
      configuration,
      now: responseBreachAt,
    });
    expect(scanned[0]?.isResponseBreached).toBe(true);
    expect(scanned[0]?.isResolutionBreached).toBe(false);
    await scanDueTicketSlaStates(prisma, { configuration, now: responseBreachAt });
    expect(reasons(memory)).toEqual([slaChangeLogReasons.responseBreached, slaChangeLogReasons.responseEscalated]);
    expect(systemBodies(memory)).toEqual([
      slaSystemEventActions.responseBreached,
      `${slaSystemEventActions.responseEscalated}:default`,
    ]);
    expect((await loadTicketSlaState(prisma, ticket.id))?.isResponseBreached).toBe(true);
  });

  it('detects a resolution SLA breach after first response', async () => {
    const { prisma, ticket, configuration } = await createStartedTicket();
    const pauseAt = new Date(ticket.createdAt.getTime() + pauseOffsetMs);
    const resolutionBreachAt = new Date(
      ticket.createdAt.getTime() + resolutionBreachOffsetMs,
    );
    await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'IN_PROGRESS'),
      previousStatus: ticket.status,
      now: pauseAt,
      event: 'status_changed',
      configuration,
    });
    const scanned = await scanDueTicketSlaStates(prisma, {
      configuration,
      now: resolutionBreachAt,
    });
    expect(scanned[0]?.isResponseBreached).toBe(false);
    expect(scanned[0]?.isResolutionBreached).toBe(true);
    expect(scanned[0]?.respondedAt).not.toBeNull();
  });

  it('does not breach or escalate while the timer is paused through the original due time', async () => {
    const { prisma, ticket, configuration, memory } = await createStartedTicket();
    const pauseAt = new Date(ticket.createdAt.getTime() + pauseOffsetMs);
    const responseBreachAt = new Date(ticket.createdAt.getTime() + responseBreachOffsetMs);
    await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'WAITING_FOR_USER'),
      previousStatus: ticket.status,
      now: pauseAt,
      event: 'status_changed',
      configuration,
    });
    const scanned = await scanDueTicketSlaStates(prisma, {
      configuration,
      now: responseBreachAt,
    });
    // Phase 2.1 (plan §2.1): a paused state has no time-driven transition left
    // (`nextDueAt` is null while paused), so the scan does not even select it.
    expect(scanned).toEqual([]);
    const paused = await loadTicketSlaState(prisma, ticket.id);
    expect(paused?.pausedAt?.toISOString()).toBe(pauseAt.toISOString());
    expect(paused?.isResponseBreached).toBe(false);
    expect(paused?.isResolutionBreached).toBe(false);
    expect(paused?.nextDueAt).toBeNull();
    expect(reasons(memory)).toEqual([]);
    expect(systemBodies(memory)).toEqual([]);

    // Resuming is an event, and it puts the state back on the schedule.
    await syncTicketSlaTimers(prisma, {
      ticket: withStatus(ticket, 'IN_PROGRESS'),
      previousStatus: 'WAITING_FOR_USER',
      now: responseBreachAt,
      event: 'user_resumed',
      configuration,
    });
    expect((await loadTicketSlaState(prisma, ticket.id))?.nextDueAt).not.toBeNull();
  });

  it('emits an escalation event from the profile rule when the timer expires', async () => {
    const { prisma, ticket, configuration, memory } = await createStartedTicket();
    const responseBreachAt = new Date(ticket.createdAt.getTime() + responseBreachOffsetMs);
    const state = await loadTicketSlaState(prisma, ticket.id);
    await memory.prisma.slaEscalationRule.create({
      data: {
        slaProfileId: state!.slaProfileId as string,
        triggerOffsetMinutes: 0,
        targetGroupId: ticketsTestIds.groupIt,
      },
    });
    configuration.escalationsEnabled = true;
    await scanDueTicketSlaStates(prisma, { configuration, now: responseBreachAt });
    const escalation = memory.changeLogs.find(
      (entry) => entry.reason === slaChangeLogReasons.responseEscalated,
    );
    expect(escalation).toBeDefined();
    expect(JSON.stringify(escalation?.diff)).toContain(ticketsTestIds.groupIt);
    expect(
      systemBodies(memory).some((body) =>
        body.startsWith(`${slaSystemEventActions.responseEscalated}:`),
      ),
    ).toBe(true);
    configuration.escalationsEnabled = false;
    const { prisma: otherPrisma, configuration: disabled, memory: disabledMemory, ticket: otherTicket } =
      await createStartedTicket();
    const otherBreachAt = new Date(otherTicket.createdAt.getTime() + responseBreachOffsetMs);
    disabled.escalationsEnabled = false;
    await scanDueTicketSlaStates(otherPrisma, {
      configuration: disabled,
      now: otherBreachAt,
    });
    expect(reasons(disabledMemory)).toEqual([slaChangeLogReasons.responseBreached]);
  });

  it('marks response at risk before breach and clears it after breach', async () => {
    const { prisma, ticket, configuration, memory } = await createStartedTicket();
    configuration.notifyBeforeOverdueMinutes = 30;
    const atRiskAt = new Date(ticket.createdAt.getTime() + 35 * 60 * 1000);
    const breachedAt = new Date(ticket.createdAt.getTime() + responseBreachOffsetMs);
    const atRiskScan = await scanDueTicketSlaStates(prisma, {
      configuration,
      now: atRiskAt,
    });
    expect(atRiskScan[0]?.isResponseAtRisk).toBe(true);
    expect(atRiskScan[0]?.isResponseBreached).toBe(false);
    expect(reasons(memory)).toEqual([slaChangeLogReasons.responseAtRisk]);
    expect(systemBodies(memory)).toEqual([slaSystemEventActions.responseAtRisk]);
    const breachedScan = await scanDueTicketSlaStates(prisma, {
      configuration,
      now: breachedAt,
    });
    expect(breachedScan[0]?.isResponseBreached).toBe(true);
    expect(breachedScan[0]?.isResponseAtRisk).toBe(false);
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
    memory: harness.memory,
  };
}

function withStatus(
  ticket: TicketSlaTicketRef,
  status: TicketSlaTicketRef['status'],
): TicketSlaTicketRef {
  return { ...ticket, status };
}

function reasons(memory: { changeLogs: readonly { reason: string }[] }) {
  return memory.changeLogs
    .map((entry) => entry.reason)
    .filter((reason) => reason.startsWith('sla_'));
}

function systemBodies(memory: {
  messages: Map<string, { body: string }>;
}) {
  return [...memory.messages.values()]
    .map((item) => item.body)
    .filter((body) => body.startsWith('ticket_sla_'));
}
