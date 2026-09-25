import { ticketSystemEventActions } from './collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsCollaborationService messages', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agentIt = { actorUserId: ticketsTestIds.agentIt };
  const agentHr = { actorUserId: ticketsTestIds.agentHr };

  it('persists public and agent replies and hides internal/system from requesters', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const userReply = await harness.collaboration.createMessage(
      ticketId,
      { type: 'USER_REPLY', body: 'Still disconnected' },
      requester,
    );
    expect(userReply.type).toBe('USER_REPLY');
    const agentReply = await harness.collaboration.createMessage(
      ticketId,
      { type: 'AGENT_REPLY', body: 'Checking the concentrator' },
      agentIt,
    );
    const internal = await harness.collaboration.createMessage(
      ticketId,
      { type: 'INTERNAL_NOTE', body: 'Likely a stale cert' },
      agentIt,
    );
    const forRequester = await harness.collaboration.listMessages(
      ticketId,
      requester,
    );
    expect(forRequester.map((item) => item.type)).toEqual([
      'USER_REPLY',
      'AGENT_REPLY',
    ]);
    expect(forRequester.map((item) => item.id)).toEqual([
      userReply.id,
      agentReply.id,
    ]);
    expect(forRequester.some((item) => item.id === internal.id)).toBe(false);
    const forAgent = await harness.collaboration.listMessages(ticketId, agentIt);
    expect(forAgent.map((item) => item.type)).toContain('SYSTEM_EVENT');
    expect(forAgent.map((item) => item.id)).toContain(internal.id);
    expect(
      forAgent.filter((item) => item.type === 'SYSTEM_EVENT').map((item) => item.body),
    ).toContain(ticketSystemEventActions.created);
    // Review S6: `take` returns the newest messages, still oldest-first.
    const newestTwo = await harness.collaboration.listMessages(ticketId, agentIt, { take: 2 });
    expect(newestTwo.map((item) => item.id)).toEqual(forAgent.slice(-2).map((item) => item.id));
    const requesterNewest = await harness.collaboration.listMessages(ticketId, requester, { take: 1 });
    expect(requesterNewest.map((item) => item.id)).toEqual([agentReply.id]);
  });

  it('rejects unauthorized message access and requester internal notes', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'INTERNAL_NOTE', body: 'secret' },
        requester,
      ),
    ).rejects.toMatchObject({ response: { code: 'MESSAGE_TYPE_NOT_ALLOWED' } });
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'SYSTEM_EVENT', body: ticketSystemEventActions.created },
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_MESSAGE_TYPE' } });
    await expect(
      harness.collaboration.listMessages(ticketId, agentHr),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'AGENT_REPLY', body: 'out of scope' },
        agentHr,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('persists a message before broadcasting it', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const order: string[] = [];
    const originalCreate = harness.memory.prisma.ticketMessage.create.bind(
      harness.memory.prisma.ticketMessage,
    );
    harness.memory.prisma.ticketMessage.create = async (args) => {
      const created = await originalCreate(args);
      order.push(`persist:${created.id}`);
      return created;
    };
    harness.realtimeHub.subscribe((payload) => {
      expect(harness.memory.messages.has(payload.id)).toBe(true);
      order.push(`broadcast:${payload.id}`);
    });
    const created = await harness.collaboration.createMessage(
      ticketId,
      { type: 'AGENT_REPLY', body: 'Persisted first' },
      agentIt,
    );
    expect(order).toEqual([
      `persist:${created.id}`,
      `broadcast:${created.id}`,
    ]);
  });
});

async function createRoutedTicket(harness: ReturnType<typeof createTicketsServiceHarness>) {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const created = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return created.id;
}
