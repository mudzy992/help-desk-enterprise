import { ticketSystemEventActions } from './collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('waiting-for-user automation', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('enters WAITING_FOR_USER, resumes on user reply, and ignores internal notes', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createInProgressTicket(harness);
    const waiting = await harness.tickets.update(
      ticketId,
      { status: 'WAITING_FOR_USER' },
      agent,
    );
    expect(waiting.status).toBe('WAITING_FOR_USER');
    expect(waiting.waitingForUserEnteredAt).not.toBeNull();
    await harness.collaboration.createMessage(
      ticketId,
      { type: 'INTERNAL_NOTE', body: 'Still waiting' },
      agent,
    );
    expect((await harness.tickets.getById(ticketId, agent)).status).toBe(
      'WAITING_FOR_USER',
    );
    await harness.collaboration.createMessage(
      ticketId,
      { type: 'USER_REPLY', body: 'Here is the screenshot' },
      requester,
    );
    const resumed = await harness.tickets.getById(ticketId, agent);
    expect(resumed.status).toBe('IN_PROGRESS');
    expect(resumed.waitingForUserEnteredAt).toBeNull();
  });

  it('records a reminder then auto-closes after the configured windows', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createInProgressTicket(harness);
    await harness.tickets.update(ticketId, { status: 'WAITING_FOR_USER' }, agent);
    const enteredAt = new Date(
      harness.memory.tickets.get(ticketId)!.waitingForUserEnteredAt!,
    );
    await harness.waitingAutomation.processDue(
      new Date(enteredAt.getTime() + 2 * 24 * 60 * 60 * 1000),
    );
    const reminded = await harness.tickets.getById(ticketId, agent);
    expect(reminded.status).toBe('WAITING_FOR_USER');
    const bodies = [
      ...harness.memory.messages.values(),
    ]
      .filter((item) => item.ticketId === ticketId)
      .map((item) => item.body);
    expect(bodies).toContain(ticketSystemEventActions.waitingForUserReminder);
    await harness.waitingAutomation.processDue(
      new Date(enteredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    );
    const closed = await harness.tickets.getById(ticketId, agent);
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).not.toBeNull();
  });

  it('does not resume or auto-close when waiting-for-user automation is disabled', async () => {
    const harness = createTicketsServiceHarness();
    harness.waitingForUserConfig.enabled = false;
    const ticketId = await createInProgressTicket(harness);
    await harness.tickets.update(ticketId, { status: 'WAITING_FOR_USER' }, agent);
    await harness.collaboration.createMessage(
      ticketId,
      { type: 'USER_REPLY', body: 'I replied' },
      requester,
    );
    expect((await harness.tickets.getById(ticketId, agent)).status).toBe(
      'WAITING_FOR_USER',
    );
    const enteredAt = new Date(
      harness.memory.tickets.get(ticketId)!.waitingForUserEnteredAt!,
    );
    await harness.waitingAutomation.processDue(
      new Date(enteredAt.getTime() + 10 * 24 * 60 * 60 * 1000),
    );
    expect((await harness.tickets.getById(ticketId, agent)).status).toBe(
      'WAITING_FOR_USER',
    );
  });
});

async function createInProgressTicket(
  harness: ReturnType<typeof createTicketsServiceHarness>,
): Promise<string> {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const created = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  await harness.tickets.update(
    created.id,
    { status: 'IN_PROGRESS' },
    { actorUserId: ticketsTestIds.agentIt },
  );
  return created.id;
}
