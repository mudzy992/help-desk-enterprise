import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { seedTicketsSlaTimers } from './seed-tickets-sla-timers';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket overdue flags on list responses', () => {
  const requester = { actorUserId: ticketsTestIds.requester };

  it('exposes persisted SLA breach flags as isOverdue without inventing SLA logic', async () => {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    const overdueTicket = await harness.tickets.create(
      vpnCreateInput({ title: 'VPN concentrator down' }),
      requester,
    );
    const onTimeTicket = await harness.tickets.create(
      vpnCreateInput({ title: 'VPN account request' }),
      requester,
    );
    expect(
      (await harness.tickets.getById(overdueTicket.id, requester)).isOverdue,
    ).toBe(false);
    markSlaBreached(harness, overdueTicket.id);
    const listed = await harness.tickets.list({}, requester);
    expect(listed.find((row) => row.id === overdueTicket.id)?.isOverdue).toBe(
      true,
    );
    expect(listed.find((row) => row.id === onTimeTicket.id)?.isOverdue).toBe(
      false,
    );
    expect(
      (await harness.tickets.getById(overdueTicket.id, requester)).isOverdue,
    ).toBe(true);
  });

  it('treats tickets without SLA state as not overdue', async () => {
    const harness = createTicketsServiceHarness();
    const created = await harness.tickets.create(vpnCreateInput(), requester);
    const listed = await harness.tickets.list({}, requester);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.isOverdue).toBe(false);
    expect(listed[0]?.sla).toBeNull();
  });

  it('exposes persisted SLA due, pause, and breach fields on ticket responses', async () => {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    const created = await harness.tickets.create(
      vpnCreateInput({ title: 'VPN concentrator down' }),
      requester,
    );
    const started = await harness.tickets.getById(created.id, requester);
    expect(started.sla?.responseDueAt).toEqual(expect.any(String));
    expect(started.sla?.resolutionDueAt).toEqual(expect.any(String));
    expect(started.sla?.pausedAt).toBeNull();
    expect(started.sla?.isResponseBreached).toBe(false);
    expect(started.sla?.isResolutionBreached).toBe(false);
    const agent = { actorUserId: ticketsTestIds.agentIt };
    await harness.tickets.update(created.id, { status: 'IN_PROGRESS' }, agent);
    await harness.tickets.update(
      created.id,
      { status: 'WAITING_FOR_USER' },
      agent,
    );
    expect(
      (await harness.tickets.getById(created.id, requester)).sla?.pausedAt,
    ).toEqual(expect.any(String));
    markSlaBreached(harness, created.id);
    const breached = await harness.tickets.getById(created.id, requester);
    expect(breached.sla?.isResolutionBreached).toBe(true);
    expect(breached.isOverdue).toBe(true);
  });
});

function markSlaBreached(
  harness: ReturnType<typeof createTicketsServiceHarness>,
  ticketId: string,
) {
  const current = [...harness.memory.slaStates.values()].find(
    (row) => row.ticketId === ticketId,
  );
  if (current === undefined) {
    throw new Error('expected SLA state');
  }
  harness.memory.slaStates.set(current.id, {
    ...current,
    isResolutionBreached: true,
  });
}
