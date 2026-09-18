import { ConflictException } from '@nestjs/common';
import { createRoutingServiceHarness, routingChangeReason } from './create-routing-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RoutingService rules', () => {
  it('lists handler groups for the create-rule select', async () => {
    const { routing } = createRoutingServiceHarness();
    await expect(routing.listHandlerGroups()).resolves.toEqual([
      { id: 'group-it', name: 'IT Support' },
      { id: 'group-net', name: 'Network Ops' },
    ]);
  });

  it('creates a routing rule for origin unit + service → group', async () => {
    const { routing } = createRoutingServiceHarness();
    const created = await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    expect(created.originUnitId).toBe('ou-leaf');
    expect(created.serviceId).toBe('service-vpn');
    expect(created.groupId).toBe('group-it');
    expect(created.originUnitPath).toBe('/Korisnici/Direkcija/IT');
    expect(created.groupName).toBe('IT Support');
  });

  it('rejects a duplicate origin unit + service rule', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      reason: routingChangeReason,
      }),
    ).rejects.toMatchObject({
      response: { code: 'DUPLICATE_RULE' },
    });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      reason: routingChangeReason,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid origin unit, service, and target group', async () => {
    const { routing } = createRoutingServiceHarness();
    await expect(
      routing.createRule({
        originUnitId: 'missing-ou',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      reason: routingChangeReason,
      }),
    ).rejects.toMatchObject({ response: { code: 'ORIGIN_UNIT_NOT_FOUND' } });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'missing-service',
        groupId: 'group-it',
      reason: routingChangeReason,
      }),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_NOT_FOUND' } });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'service-vpn',
        groupId: 'missing-group',
        reason: routingChangeReason,
      }),
    ).rejects.toMatchObject({ response: { code: 'GROUP_NOT_FOUND' } });
  });

  it('updates the target group and deletes with parent fallback', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-child',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const exact = await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const updated = await routing.updateRule(exact.id, {
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-net',
      reason: 'Retarget leaf rule to Network Ops',
    });
    expect(updated.groupId).toBe('group-net');
    expect(updated.groupName).toBe('Network Ops');
    const impact = await routing.deleteImpact(exact.id);
    expect(impact.before.outcome).toBe('EXACT');
    expect(impact.after.outcome).toBe('PARENT_FALLBACK');
    expect(impact.after.groupId).toBe('group-it');
    await routing.deleteRule(exact.id, {
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      reason: 'Remove leaf override',
    });
    await expect(
      routing.resolve({ originUnitId: 'ou-leaf', serviceId: 'service-vpn' }),
    ).resolves.toMatchObject({
      outcome: 'PARENT_FALLBACK',
      groupId: 'group-it',
      matchedOriginUnitId: 'ou-child',
    });
  });
});
