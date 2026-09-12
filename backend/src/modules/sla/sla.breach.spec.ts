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

const pauseAt = new Date('2026-09-11T12:20:00.000Z');
const responseBreachAt = new Date('2026-09-11T13:30:00.000Z');
const resolutionBreachAt = new Date('2026-09-16T12:00:00.000Z');

describe('ticket SLA breach and escalation', () => {
  it('detects a response SLA breach on scan and keeps the flag sticky', async () => {
    const { prisma, ticket, configuration, memory } = await createStartedTicket();
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
      slaSystemEventActions.responseEscalated,
    ]);
    expect((await loadTicketSlaState(prisma, ticket.id))?.isResponseBreached).toBe(true);
  });

  it('detects a resolution SLA breach after first response', async () => {
    const { prisma, ticket, configuration } = await createStartedTicket();
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
    expect(scanned[0]?.pausedAt?.toISOString()).toBe(pauseAt.toISOString());
    expect(scanned[0]?.isResponseBreached).toBe(false);
    expect(scanned[0]?.isResolutionBreached).toBe(false);
    expect(reasons(memory)).toEqual([]);
    expect(systemBodies(memory)).toEqual([]);
  });

  it('emits an escalation event from the profile rule when the timer expires', async () => {
    const { prisma, ticket, configuration, memory } = await createStartedTicket();
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
    expect(systemBodies(memory)).toContain(slaSystemEventActions.responseEscalated);
    configuration.escalationsEnabled = false;
    const { prisma: otherPrisma, configuration: disabled, memory: disabledMemory } =
      await createStartedTicket();
    disabled.escalationsEnabled = false;
    await scanDueTicketSlaStates(otherPrisma, {
      configuration: disabled,
      now: responseBreachAt,
    });
    expect(reasons(disabledMemory)).toEqual([slaChangeLogReasons.responseBreached]);
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
