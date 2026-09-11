import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket split', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('creates linked children, copies selected messages, and audits the parent', async () => {
    const harness = createTicketsServiceHarness();
    const parent = await createRoutedTicket(harness);
    await harness.collaboration.createMessage(
      parent.id,
      { type: 'AGENT_REPLY', body: 'Keep this context' },
      agent,
    );
    const messageId = [...harness.memory.messages.values()].find(
      (item) => item.body === 'Keep this context',
    )?.id;
    const result = await harness.split.split(
      parent.id,
      {
        reason: 'Two separate services',
        children: [
          { title: 'Network path' },
          {
            title: 'Access path',
            messageIds: messageId === undefined ? [] : [messageId],
          },
        ],
      },
      agent,
    );
    expect(result.children).toHaveLength(2);
    expect(result.children.every((child) => child.parentTicketId === parent.id)).toBe(
      true,
    );
    expect(result.children[0].requesterId).toBe(ticketsTestIds.requester);
    const parentEvents = [...harness.memory.messages.values()].filter(
      (item) => item.ticketId === parent.id && item.type === 'SYSTEM_EVENT',
    );
    expect(parentEvents.some((item) => item.body.startsWith('ticket_split:'))).toBe(
      true,
    );
    const copied = [...harness.memory.messages.values()].filter(
      (item) =>
        item.ticketId === result.children[1].id && item.body === 'Keep this context',
    );
    expect(copied).toHaveLength(1);
  });

  it('rejects requester split, disabled split, and fewer than two children', async () => {
    const harness = createTicketsServiceHarness();
    const parent = await createRoutedTicket(harness);
    await expect(
      harness.split.split(
        parent.id,
        { reason: 'Nope', children: [{ title: 'A' }, { title: 'B' }] },
        requester,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    harness.splitConfig.enabled = false;
    await expect(
      harness.split.split(
        parent.id,
        { reason: 'Nope', children: [{ title: 'A' }, { title: 'B' }] },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'SPLIT_DISABLED' } });
    harness.splitConfig.enabled = true;
    await expect(
      harness.split.split(
        parent.id,
        { reason: 'Nope', children: [{ title: 'A' }] },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_SPLIT_CHILDREN' } });
  });
});

async function createRoutedTicket(
  harness: ReturnType<typeof createTicketsServiceHarness>,
) {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  return harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
}
