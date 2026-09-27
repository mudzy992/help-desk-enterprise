import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('Paket 2.4 — following (FOLLOWER)', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agentIt = { actorUserId: ticketsTestIds.agentIt };
  const agentHr = { actorUserId: ticketsTestIds.agentHr };

  async function setup() {
    const harness = createTicketsServiceHarness();
    await harness.routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const created = await harness.tickets.create(vpnCreateInput(), requester);
    return { ...harness, created };
  }

  it('follow and unfollow are idempotent and followers are not participants', async () => {
    const { agentCollaboration, collaboration, created } = await setup();
    await agentCollaboration.follow(created.id, agentIt);
    const state = await agentCollaboration.follow(created.id, agentIt);
    expect(state).toEqual({ following: true, followerCount: 1 });
    const participants = await collaboration.listParticipants(created.id, agentIt);
    expect(participants.some((item) => item.role === 'FOLLOWER')).toBe(false);
    await agentCollaboration.unfollow(created.id, agentIt);
    expect(await agentCollaboration.unfollow(created.id, agentIt)).toEqual({
      following: false,
      followerCount: 0,
    });
  });

  it('staff without access cannot follow, and a FOLLOWER row never grants access', async () => {
    const { agentCollaboration, tickets, memory, created } = await setup();
    await expect(agentCollaboration.follow(created.id, agentHr)).rejects.toBeDefined();
    await memory.prisma.ticketParticipant.create({
      data: { ticketId: created.id, userId: ticketsTestIds.agentHr, groupId: null, role: 'FOLLOWER' },
    });
    await expect(tickets.getById(created.id, agentHr)).rejects.toBeDefined();
  });

  it('the requester cannot follow', async () => {
    const { agentCollaboration, created } = await setup();
    await expect(agentCollaboration.follow(created.id, requester)).rejects.toMatchObject({
      response: { code: 'FOLLOW_NOT_ALLOWED' },
    });
  });
});
