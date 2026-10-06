import { routingOutcomes } from './routing.constants';
import { createRoutingServiceHarness, routingChangeReason } from './create-routing-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RoutingService coverage', () => {
  it('defaults to active services and reports the lifecycle', async () => {
    const { memory, routing } = createRoutingServiceHarness();
    memory.seedService({
      id: 'service-active',
      name: 'Active service',
      lifecycle: 'ACTIVE',
      availability: 'OPERATIONAL',
    });
    memory.seedService({
      id: 'service-deprecated',
      name: 'Old service',
      lifecycle: 'DEPRECATED',
      availability: 'OPERATIONAL',
    });

    const page = await routing.coverage({});
    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.serviceId)).toEqual([
      'service-active',
      'service-active',
      'service-active',
    ]);
    expect(page.items[0]?.serviceLifecycle).toBe('ACTIVE');
    expect(page.nextCursor).toBeNull();
  });

  it('includes inactive services and paginates complete service rows with both filters', async () => {
    const { memory, routing } = createRoutingServiceHarness();
    memory.seedService({
      id: 'service-active',
      name: 'Active service',
      lifecycle: 'ACTIVE',
      availability: 'OPERATIONAL',
    });
    memory.seedService({
      id: 'service-deprecated',
      name: 'Old service',
      lifecycle: 'DEPRECATED',
      availability: 'OPERATIONAL',
    });
    const all = await routing.coverage({ includeInactive: true, take: 10 });
    expect(all.total).toBe(3);
    expect(new Set(all.items.map((item) => item.serviceId))).toEqual(
      new Set(['service-active', 'service-deprecated', 'service-vpn']),
    );
    expect(
      Object.fromEntries(
        all.items.map((item) => [item.serviceId, item.serviceLifecycle]),
      ),
    ).toEqual({
      'service-active': 'ACTIVE',
      'service-deprecated': 'DEPRECATED',
      'service-vpn': 'DRAFT',
    });

    const first = await routing.coverage({ includeInactive: true, take: 1 });
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(3);
    const firstServiceId = first.items[0]?.serviceId;
    expect(first.items.every((item) => item.serviceId === firstServiceId)).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await routing.coverage({
      includeInactive: true,
      take: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.total).toBe(3);
    expect(second.items).toHaveLength(3);
    const secondServiceId = second.items[0]?.serviceId;
    expect(secondServiceId).not.toBe(firstServiceId);
    expect(second.items.every((item) => item.serviceId === secondServiceId)).toBe(true);
    expect(second.nextCursor).not.toBeNull();

    const third = await routing.coverage({
      includeInactive: true,
      take: 1,
      cursor: second.nextCursor ?? undefined,
    });
    expect(third.total).toBe(3);
    expect(third.items).toHaveLength(3);
    expect(third.items.every((item) => item.serviceId !== firstServiceId && item.serviceId !== secondServiceId)).toBe(true);
    expect(third.nextCursor).toBeNull();

    const filtered = await routing.coverage({
      includeInactive: true,
      originUnitId: 'ou-child',
      serviceId: 'service-vpn',
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({
      originUnitId: 'ou-child',
      serviceId: 'service-vpn',
    });
  });

  it('rejects malformed coverage cursors', async () => {
    const { routing } = createRoutingServiceHarness();
    await expect(routing.coverage({ cursor: 'not-a-cursor' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('classifies exact, inherited, missing, and unrouted combinations', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-child',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const coveragePage = await routing.coverage({
      serviceId: 'service-vpn',
      includeInactive: true,
    });
    const byOrigin = Object.fromEntries(
      coveragePage.items.map((item) => [item.originUnitId, item]),
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

    const filteredToLeaf = await routing.coverage({
      serviceId: 'service-vpn',
      originUnitId: 'ou-leaf',
      includeInactive: true,
    });
    expect(filteredToLeaf.items[0]?.resolution.outcome).toBe(
      routingOutcomes.parentFallback,
    );
  });
});
