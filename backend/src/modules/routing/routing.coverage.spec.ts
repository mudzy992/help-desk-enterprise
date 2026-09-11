import { routingOutcomes } from './routing.constants';
import { createRoutingServiceHarness } from './create-routing-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RoutingService coverage', () => {
  it('classifies exact, inherited, missing, and unrouted combinations', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-child',
      serviceId: 'service-vpn',
      groupId: 'group-it',
    });
    const coverage = await routing.coverage({ serviceId: 'service-vpn' });
    const byOrigin = Object.fromEntries(
      coverage.map((item) => [item.originUnitId, item]),
    );
    expect(byOrigin['ou-child']?.hasExactRule).toBe(true);
    expect(byOrigin['ou-child']?.resolution.outcome).toBe(routingOutcomes.exact);
    expect(byOrigin['ou-leaf']?.hasExactRule).toBe(false);
    expect(byOrigin['ou-leaf']?.resolution.outcome).toBe(
      routingOutcomes.parentFallback,
    );
    expect(byOrigin['ou-root']?.hasExactRule).toBe(false);
    expect(byOrigin['ou-root']?.resolution.outcome).toBe(
      routingOutcomes.unrouted,
    );
    expect(byOrigin['ou-root']?.resolution.groupId).toBeNull();
  });
});
