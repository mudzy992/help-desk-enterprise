import { routingOutcomes } from './routing.constants';
import { createRoutingServiceHarness, routingChangeReason } from './create-routing-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RoutingService resolution', () => {
  it('returns an exact match before parent fallback', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const resolved = await routing.resolve({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
    });
    expect(resolved.outcome).toBe(routingOutcomes.exact);
    expect(resolved.matchedOriginUnitId).toBe('ou-leaf');
    expect(resolved.fallbackDepth).toBe(0);
    expect(resolved.fallbackPath).toEqual(['/Korisnici/Direkcija/IT']);
    expect(resolved.unroutedQueue).toBeNull();
  });

  it('walks one parent and then multiple parents', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-child',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const oneLevel = await routing.resolve({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
    });
    expect(oneLevel.outcome).toBe(routingOutcomes.parentFallback);
    expect(oneLevel.matchedOriginUnitId).toBe('ou-child');
    expect(oneLevel.fallbackDepth).toBe(1);
    expect(oneLevel.fallbackPath).toEqual([
      '/Korisnici/Direkcija/IT',
      '/Korisnici/Direkcija',
    ]);
    const { routing: multi } = createRoutingServiceHarness();
    await multi.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const twoLevel = await multi.resolve({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
    });
    expect(twoLevel.fallbackDepth).toBe(2);
    expect(twoLevel.matchedOriginUnitId).toBe('ou-root');
    expect(twoLevel.fallbackPath).toEqual([
      '/Korisnici/Direkcija/IT',
      '/Korisnici/Direkcija',
      '/Korisnici',
    ]);
  });

  it('returns UNROUTED at root and when no ancestor has a rule', async () => {
    const { routing } = createRoutingServiceHarness();
    const root = await routing.resolve({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
    });
    expect(root.outcome).toBe(routingOutcomes.unrouted);
    expect(root.groupId).toBeNull();
    expect(root.matchedRuleId).toBeNull();
    expect(root.unroutedQueue).toEqual({
      enabled: true,
      ownerRole: 'SUPER_ADMIN',
    });
    const leaf = await routing.resolve({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
    });
    expect(leaf.outcome).toBe(routingOutcomes.unrouted);
    expect(leaf.groupId).toBeNull();
    expect(leaf.fallbackPath).toEqual([
      '/Korisnici/Direkcija/IT',
      '/Korisnici/Direkcija',
      '/Korisnici',
    ]);
  });

  it('is deterministic for the same origin unit and service', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const first = await routing.resolve({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
    });
    const second = await routing.resolve({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
    });
    expect(second).toEqual(first);
  });
});
