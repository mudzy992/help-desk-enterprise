import { accessCreateInput } from './access-create-input';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsService list filters', () => {
  it('filters by assignedUserId, priority, and text query without changing other rows', async () => {
    const { tickets, memory } = createTicketsServiceHarness();
    const actor = { actorUserId: ticketsTestIds.requester };
    const vpn = await tickets.create(
      vpnCreateInput({ title: 'VPN concentrator down' }),
      actor,
    );
    const access = await tickets.create(accessCreateInput(), actor);
    const vpnRecord = memory.tickets.get(vpn.id);
    if (vpnRecord === undefined) {
      throw new Error('expected vpn ticket');
    }
    memory.tickets.set(vpn.id, {
      ...vpnRecord,
      assignedUserId: ticketsTestIds.agentIt,
      priority: 'LOW',
    });
    const byAssignee = await tickets.list(
      { assignedUserId: ticketsTestIds.agentIt },
      actor,
    );
    expect(byAssignee.map((row) => row.id)).toEqual([vpn.id]);
    const byPriority = await tickets.list({ priority: 'LOW' }, actor);
    expect(byPriority.map((row) => row.id)).toEqual([vpn.id]);
    const byQuery = await tickets.list({ q: 'vpn' }, actor);
    expect(byQuery.map((row) => row.id)).toEqual([vpn.id]);
    const unfiltered = await tickets.list({}, actor);
    expect(unfiltered.map((row) => row.id).sort()).toEqual(
      [vpn.id, access.id].sort(),
    );
  });
});
