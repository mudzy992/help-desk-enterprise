import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsService group inbox and claim', () => {
  it('shows unassigned group tickets only to scoped group members', async () => {
    const { tickets, routing, memory } = createTicketsServiceHarness();
    await routeVpnToIt(routing);
    memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    const created = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const inbox = await tickets.listInbox({
      actorUserId: ticketsTestIds.agentIt,
    });
    expect(inbox.map((item) => item.id)).toEqual([created.id]);
    expect(inbox[0]?.assignedGroupId).toBe(ticketsTestIds.groupIt);
    expect(inbox[0]?.assignedUserId).toBeNull();
    await expect(
      tickets.listInbox({ actorUserId: ticketsTestIds.agentHr }),
    ).resolves.toEqual([]);
    await expect(
      tickets.listInbox({ actorUserId: ticketsTestIds.requester }),
    ).resolves.toEqual([]);
  });

  it('hides inbox tickets that are outside the agent OU/service scope', async () => {
    const { tickets, routing, memory, contexts } = createTicketsServiceHarness();
    await routeVpnToIt(routing);
    memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentHr,
    });
    await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(contexts.get(ticketsTestIds.agentHr)?.assignments[0]?.organizationalUnitId).toBe(
      ticketsTestIds.ouHr,
    );
    await expect(
      tickets.listInbox({ actorUserId: ticketsTestIds.agentHr }),
    ).resolves.toEqual([]);
  });

  it('lets an authorized group member claim a pending inbox ticket', async () => {
    const { tickets, routing, memory } = createTicketsServiceHarness();
    await routeVpnToIt(routing);
    memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    const created = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const claimed = await tickets.claim(created.id, {
      actorUserId: ticketsTestIds.agentIt,
    });
    expect(claimed.assignedUserId).toBe(ticketsTestIds.agentIt);
    expect(claimed.status).toBe('ASSIGNED');
    await expect(
      tickets.listInbox({ actorUserId: ticketsTestIds.agentIt }),
    ).resolves.toEqual([]);
  });

  it('rejects invalid claims outside group, scope, or claimable state', async () => {
    const { tickets, routing, memory } = createTicketsServiceHarness();
    const unrouted = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await expect(
      tickets.claim(unrouted.id, { actorUserId: ticketsTestIds.agentIt }),
    ).rejects.toMatchObject({ response: { code: 'TICKET_NOT_CLAIMABLE' } });
    await routeVpnToIt(routing);
    const routed = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await expect(
      tickets.claim(routed.id, { actorUserId: ticketsTestIds.requester }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      tickets.claim(routed.id, { actorUserId: ticketsTestIds.agentIt }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentHr,
    });
    await expect(
      tickets.claim(routed.id, { actorUserId: ticketsTestIds.agentHr }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});

async function routeVpnToIt(routing: {
  createRule(input: {
    originUnitId: string;
    serviceId: string;
    groupId: string;
    reason: string;
  }): Promise<unknown>;
}): Promise<void> {
  await routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
}
