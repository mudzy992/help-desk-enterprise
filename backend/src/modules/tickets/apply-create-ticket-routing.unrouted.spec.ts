jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { applyCreateTicketRouting } from './apply-create-ticket-routing';

describe('applyCreateTicketRouting — package 1.7 U1 fallback', () => {
  const unrouted = { outcome: 'UNROUTED', groupId: null };
  const input = { originUnitId: 'ou', serviceId: 's' };

  it('sends a ticket without a rule to the target group as PENDING', async () => {
    const routing = { resolve: async () => unrouted, resolveUnroutedTargetGroupId: async () => 'g1' };
    await expect(applyCreateTicketRouting(routing as never, input)).resolves.toEqual({
      status: 'PENDING',
      assignedGroupId: 'g1',
      routedByUnroutedFallback: true,
    });
  });

  it('keeps UNROUTED when no (existing) target group is configured', async () => {
    const routing = { resolve: async () => unrouted, resolveUnroutedTargetGroupId: async () => null };
    await expect(applyCreateTicketRouting(routing as never, input)).resolves.toEqual({
      status: 'UNROUTED',
      assignedGroupId: null,
      routedByUnroutedFallback: false,
    });
  });

  it('a matched rule never uses the fallback', async () => {
    const target = jest.fn();
    const routing = { resolve: async () => ({ outcome: 'EXACT', groupId: 'rule-group' }), resolveUnroutedTargetGroupId: target };
    await expect(applyCreateTicketRouting(routing as never, input)).resolves.toMatchObject({
      assignedGroupId: 'rule-group',
      routedByUnroutedFallback: false,
    });
    expect(target).not.toHaveBeenCalled();
  });
});
