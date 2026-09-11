import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { seedItPeerAgent } from './seed-tickets-harness-actors';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsService auto-assignment', () => {
  it('assigns the least-busy eligible group member', async () => {
    const harness = await prepareAssignableGroup();
    harness.assignmentConfig.autoAssignEnabled = true;
    harness.memory.seedService({
      id: ticketsTestIds.serviceVpn,
      name: 'VPN access',
      lifecycle: 'ACTIVE',
      availability: 'OPERATIONAL',
      classification: 'INTERNAL',
      isConfidentialDefault: false,
      autoAssignStrategy: 'LEAST_BUSY',
    });
    const busy = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await harness.tickets.claim(busy.id, {
      actorUserId: ticketsTestIds.agentIt,
    });
    const created = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(created.assignedUserId).toBe(ticketsTestIds.agentItPeer);
    expect(created.status).toBe('ASSIGNED');
    expect(created.assignedGroupId).toBe(ticketsTestIds.groupIt);
  });

  it('assigns round-robin in sorted user-id order', async () => {
    const harness = await prepareAssignableGroup();
    harness.assignmentConfig.autoAssignEnabled = true;
    harness.assignmentConfig.autoAssignStrategy = 'ROUND_ROBIN';
    const first = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const second = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(first.assignedUserId).toBe(ticketsTestIds.agentIt);
    expect(second.assignedUserId).toBe(ticketsTestIds.agentItPeer);
    expect(first.status).toBe('ASSIGNED');
    expect(second.status).toBe('ASSIGNED');
  });

  it('leaves the ticket in the group inbox when no eligible agent exists', async () => {
    const { tickets, routing, assignmentConfig } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    assignmentConfig.autoAssignEnabled = true;
    const created = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(created.status).toBe('PENDING');
    expect(created.assignedGroupId).toBe(ticketsTestIds.groupIt);
    expect(created.assignedUserId).toBeNull();
  });

  it('does not assign an out-of-scope group member or an unrouted ticket', async () => {
    const { tickets, routing, memory, assignmentConfig } =
      createTicketsServiceHarness();
    assignmentConfig.autoAssignEnabled = true;
    const unrouted = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(unrouted.assignedUserId).toBeNull();
    expect(unrouted.status).toBe('UNROUTED');
    await routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentHr,
    });
    const routed = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(routed.assignedGroupId).toBe(ticketsTestIds.groupIt);
    expect(routed.assignedUserId).toBeNull();
    expect(routed.status).toBe('PENDING');
  });
});

async function prepareAssignableGroup() {
  const harness = createTicketsServiceHarness();
  harness.memory.seedUser({
    id: ticketsTestIds.agentItPeer,
    organizationalUnitId: ticketsTestIds.ouIt,
  });
  seedItPeerAgent(harness.contexts);
  harness.memory.seedGroupMember({
    groupId: ticketsTestIds.groupIt,
    userId: ticketsTestIds.agentIt,
  });
  harness.memory.seedGroupMember({
    groupId: ticketsTestIds.groupIt,
    userId: ticketsTestIds.agentItPeer,
  });
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  return harness;
}
