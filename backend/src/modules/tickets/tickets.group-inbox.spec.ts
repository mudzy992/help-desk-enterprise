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
    const inbox = await tickets.listInbox(
      {},
      { actorUserId: ticketsTestIds.agentIt },
    );
    expect(inbox.items.map((item) => item.id)).toEqual([created.id]);
    expect(inbox.total).toBe(1);
    expect(inbox.items[0]?.assignedGroupId).toBe(ticketsTestIds.groupIt);
    expect(inbox.items[0]?.assignedUserId).toBeNull();
    expect(
      (await tickets.listInbox({}, { actorUserId: ticketsTestIds.agentHr })).items,
    ).toEqual([]);
    expect(
      (await tickets.listInbox({}, { actorUserId: ticketsTestIds.requester })).items,
    ).toEqual([]);
  });

  it('shows the group\'s tickets to a member outside the ticket OU (D1)', async () => {
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
    expect(
      (await tickets.listInbox({}, { actorUserId: ticketsTestIds.agentHr })).items,
    ).toHaveLength(1);
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
    expect(
      (await tickets.listInbox({}, { actorUserId: ticketsTestIds.agentIt })).items,
    ).toEqual([]);
  });

  it('rejects claims outside the group or claimable state', async () => {
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
    // A member of the handling group may claim even outside the ticket OU (D1).
    memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentHr,
    });
    const claimed = await tickets.claim(routed.id, {
      actorUserId: ticketsTestIds.agentHr,
    });
    expect(claimed.assignedUserId).toBe(ticketsTestIds.agentHr);
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
