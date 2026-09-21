import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { seedItPeerAgent } from './seed-tickets-harness-actors';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const first = ticketsTestIds.agentIt;
const second = ticketsTestIds.agentItPeer;

async function setup() {
  const harness = createTicketsServiceHarness();
  const { memory } = harness;
  seedItPeerAgent(harness.contexts);
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  for (const [userId, displayName] of [
    [first, 'Agent IT'],
    [second, 'Peer IT'],
  ] as const) {
    memory.seedGroupMember({ groupId: ticketsTestIds.groupIt, userId });
    memory.seedUser({
      id: userId,
      organizationalUnitId: ticketsTestIds.ouIt,
      displayName,
    });
  }
  const ticket = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  const assignees = () =>
    [...memory.participants.values()].filter(
      (item) => item.ticketId === ticket.id && item.role === 'ASSIGNEE',
    );
  const claimChanges = () =>
    memory.changeLogs.filter((entry) => entry.reason === 'ticket_claim');
  return { ...harness, ticket, assignees, claimChanges };
}

describe('claim is atomic and never takes over a colleague ticket', () => {
  it('rejects a second agent and names who already holds the ticket', async () => {
    const { tickets, memory, ticket } = await setup();
    await tickets.claim(ticket.id, { actorUserId: first });
    await expect(
      tickets.claim(ticket.id, { actorUserId: second }),
    ).rejects.toMatchObject({
      response: {
        code: 'TICKET_NOT_CLAIMABLE',
        details: { claimedByName: 'Agent IT' },
      },
    });
    expect(memory.tickets.get(ticket.id)?.assignedUserId).toBe(first);
  });

  it('lets exactly one of two simultaneous claims win', async () => {
    const { tickets, memory, ticket, assignees, claimChanges } = await setup();
    const results = await Promise.allSettled([
      tickets.claim(ticket.id, { actorUserId: first }),
      tickets.claim(ticket.id, { actorUserId: second }),
    ]);
    const won = results.filter((item) => item.status === 'fulfilled');
    const lost = results.filter(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]?.reason).toMatchObject({
      response: { code: 'TICKET_NOT_CLAIMABLE' },
    });
    const holder = memory.tickets.get(ticket.id)?.assignedUserId;
    expect([first, second]).toContain(holder);
    expect(assignees()).toHaveLength(1);
    expect(claimChanges()).toHaveLength(1);
  });

  it('is idempotent when the same agent claims twice, also concurrently', async () => {
    const { tickets, ticket, assignees, claimChanges } = await setup();
    const results = await Promise.all([
      tickets.claim(ticket.id, { actorUserId: first }),
      tickets.claim(ticket.id, { actorUserId: first }),
    ]);
    expect(results.map((item) => item.assignedUserId)).toEqual([first, first]);
    expect(assignees()).toHaveLength(1);
    expect(claimChanges()).toHaveLength(1);
  });

  it('still claims an unassigned ticket that was handed back to the group mid-work', async () => {
    const { tickets, memory, ticket } = await setup();
    const current = memory.tickets.get(ticket.id);
    if (current === undefined) {
      throw new Error('ticket missing');
    }
    // Bulk "assign to group" clears the assignee but keeps the status.
    memory.tickets.set(ticket.id, {
      ...current,
      assignedUserId: null,
      status: 'IN_PROGRESS',
    });
    const claimed = await tickets.claim(ticket.id, { actorUserId: second });
    expect(claimed.assignedUserId).toBe(second);
    expect(claimed.status).toBe('IN_PROGRESS');
  });

  it('does not reveal the holder to an agent who may not claim', async () => {
    const { tickets, ticket } = await setup();
    await tickets.claim(ticket.id, { actorUserId: first });
    const rejection: unknown = await tickets
      .claim(ticket.id, { actorUserId: ticketsTestIds.agentHr })
      .catch((error: unknown) => error);
    expect(rejection).toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(JSON.stringify(rejection)).not.toContain('Agent IT');
  });
});
