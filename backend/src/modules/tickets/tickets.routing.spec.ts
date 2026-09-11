import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket create routing application', () => {
  it('uses parent fallback group without changing routing outcomes', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ticketsTestIds.ouRoot,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'Root VPN coverage',
    });
    const resolved = await routing.resolve({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
    });
    expect(resolved.outcome).toBe('PARENT_FALLBACK');
    expect(resolved.groupId).toBe(ticketsTestIds.groupIt);
    const created = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(created.status).toBe('PENDING');
    expect(created.assignedGroupId).toBe(ticketsTestIds.groupIt);
  });
});
