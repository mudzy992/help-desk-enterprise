import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsCollaborationService participants', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agentIt = { actorUserId: ticketsTestIds.agentIt };
  const agentHr = { actorUserId: ticketsTestIds.agentHr };

  it('seeds requester and handler group on create and lists them', async () => {
    const { tickets, collaboration, routing } = createTicketsServiceHarness();
    await routeVpn(routing);
    const created = await tickets.create(vpnCreateInput(), requester);
    const listed = await collaboration.listParticipants(created.id, requester);
    expect(listed.map((item) => item.role).sort()).toEqual([
      'HANDLER_GROUP',
      'REQUESTER',
    ]);
    expect(
      listed.find((item) => item.role === 'REQUESTER')?.userId,
    ).toBe(ticketsTestIds.requester);
    expect(
      listed.find((item) => item.role === 'HANDLER_GROUP')?.groupId,
    ).toBe(ticketsTestIds.groupIt);
  });

  it('lets scoped staff add and remove a watcher', async () => {
    const { tickets, collaboration, routing } = createTicketsServiceHarness();
    await routeVpn(routing);
    const created = await tickets.create(vpnCreateInput(), requester);
    const added = await collaboration.addParticipant(
      created.id,
      { role: 'WATCHER', userId: ticketsTestIds.watcher },
      agentIt,
    );
    expect(added.role).toBe('WATCHER');
    expect(added.userId).toBe(ticketsTestIds.watcher);
    const listed = await collaboration.listParticipants(created.id, requester);
    expect(listed.some((item) => item.id === added.id)).toBe(true);
    await collaboration.removeParticipant(created.id, added.id, agentIt);
    const remaining = await collaboration.listParticipants(
      created.id,
      requester,
    );
    expect(remaining.some((item) => item.id === added.id)).toBe(false);
  });

  it('rejects participant mutations outside scope and locked system roles', async () => {
    const { tickets, collaboration, routing } = createTicketsServiceHarness();
    await routeVpn(routing);
    const created = await tickets.create(vpnCreateInput(), requester);
    await expect(
      collaboration.addParticipant(
        created.id,
        { role: 'WATCHER', userId: ticketsTestIds.watcher },
        requester,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      collaboration.addParticipant(
        created.id,
        { role: 'WATCHER', userId: ticketsTestIds.watcher },
        agentHr,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      collaboration.addParticipant(
        created.id,
        { role: 'REQUESTER', userId: ticketsTestIds.watcher },
        agentIt,
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_PARTICIPANT_ROLE' },
    });
    const seeded = await collaboration.listParticipants(created.id, agentIt);
    const requesterParticipant = seeded.find((item) => item.role === 'REQUESTER');
    await expect(
      collaboration.removeParticipant(
        created.id,
        requesterParticipant?.id ?? '',
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'PARTICIPANT_LOCKED' } });
  });

  it('adds ASSIGNEE on claim without duplicating the requester', async () => {
    const { tickets, collaboration, routing, memory } =
      createTicketsServiceHarness();
    await routeVpn(routing);
    memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    const created = await tickets.create(vpnCreateInput(), requester);
    await tickets.claim(created.id, agentIt);
    const listed = await collaboration.listParticipants(created.id, agentIt);
    expect(listed.filter((item) => item.role === 'ASSIGNEE')).toEqual([
      expect.objectContaining({ userId: ticketsTestIds.agentIt }),
    ]);
  });
});

async function routeVpn(routing: {
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
