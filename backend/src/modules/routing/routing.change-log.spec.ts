import { BadRequestException, NotFoundException } from '@nestjs/common';
import { routingOutcomes } from './routing.constants';
import {
  createRoutingServiceHarness,
  routingChangeReason,
} from './create-routing-service-harness';
import { changeLogEntityTypes } from '../change-log/change-log.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RoutingService change log', () => {
  it('records actor, resource, effective before/after, and a deterministic diff', async () => {
    const { routing, memory } = createRoutingServiceHarness();
    await routing.createRule(
      {
        originUnitId: 'ou-leaf',
        serviceId: 'service-vpn',
        groupId: 'group-it',
        reason: routingChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    expect(memory.changeLogs).toHaveLength(1);
    const entry = memory.changeLogs[0];
    expect(entry).toMatchObject({
      entityType: changeLogEntityTypes.routingRule,
      entityId: 'routing-1',
      reason: routingChangeReason,
      actorUserId: 'admin-1',
    });
    expect(entry.diff.before).toMatchObject({
      originUnitId: 'ou-leaf',
      originUnitPath: '/Korisnici/Direkcija/IT',
      serviceId: 'service-vpn',
      serviceName: 'VPN access',
      targetGroupId: null,
      outcome: routingOutcomes.unrouted,
      unrouted: true,
      unroutedQueue: { enabled: true, ownerRole: 'SUPER_ADMIN' },
    });
    expect(entry.diff.after).toMatchObject({
      originUnitId: 'ou-leaf',
      targetGroupId: 'group-it',
      targetGroupName: 'IT Support',
      outcome: routingOutcomes.exact,
      unrouted: false,
      matchedRuleId: 'routing-1',
    });
    expect(entry.diff.changes.some((item) => item.path === 'outcome')).toBe(
      true,
    );
    expect(JSON.stringify(entry.diff)).toBe(
      JSON.stringify(JSON.parse(JSON.stringify(entry.diff))),
    );
  });

  it('requires a reason and does not log failed mutations', async () => {
    const { routing, memory } = createRoutingServiceHarness();
    await expect(
      routing.createRule({
        originUnitId: 'ou-leaf',
        serviceId: 'service-vpn',
        groupId: 'group-it',
        reason: '  ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      routing.createRule({
        originUnitId: 'missing-ou',
        serviceId: 'service-vpn',
        groupId: 'group-it',
        reason: routingChangeReason,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(memory.changeLogs).toEqual([]);
  });

  it('captures parent fallback in the before snapshot', async () => {
    const { routing, memory } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-child',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    await routing.createRule(
      {
        originUnitId: 'ou-leaf',
        serviceId: 'service-vpn',
        groupId: 'group-it',
        reason: 'Override inherited route with an exact rule',
      },
      { actorUserId: 'admin-2' },
    );
    const leafEntry = memory.changeLogs[1];
    expect(leafEntry.diff.before).toMatchObject({
      outcome: routingOutcomes.parentFallback,
      targetGroupId: 'group-it',
      matchedOriginUnitId: 'ou-child',
      unrouted: false,
    });
    expect(leafEntry.diff.after).toMatchObject({
      outcome: routingOutcomes.exact,
      matchedOriginUnitId: 'ou-leaf',
    });
    expect(leafEntry.actorUserId).toBe('admin-2');
  });

  it('records update and delete diffs and lists newest first', async () => {
    const { routing, memory } = createRoutingServiceHarness();
    const created = await routing.createRule(
      {
        originUnitId: 'ou-leaf',
        serviceId: 'service-vpn',
        groupId: 'group-it',
        reason: routingChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    await routing.updateRule(
      created.id,
      {
        originUnitId: 'ou-leaf',
        serviceId: 'service-vpn',
        groupId: 'group-net',
        reason: 'Switch leaf to Network Ops',
      },
      { actorUserId: 'admin-2' },
    );
    await routing.deleteRule(
      created.id,
      {
        originUnitId: 'ou-leaf',
        serviceId: 'service-vpn',
        reason: 'Drop unused leaf rule',
      },
      { actorUserId: 'admin-3' },
    );
    expect(memory.changeLogs).toHaveLength(3);
    expect(memory.changeLogs[1].diff.action).toBe('update');
    expect(memory.changeLogs[1].diff.after).toMatchObject({
      targetGroupId: 'group-net',
      outcome: routingOutcomes.exact,
    });
    expect(memory.changeLogs[2].diff.action).toBe('delete');
    expect(memory.changeLogs[2].diff.after).toMatchObject({
      outcome: routingOutcomes.unrouted,
      targetGroupId: null,
    });
    const listed = await routing.listChanges();
    expect(listed.map((entry) => entry.diff.action)).toEqual([
      'delete',
      'update',
      'create',
    ]);
    expect(listed[0]).toMatchObject({
      reason: 'Drop unused leaf rule',
      actorUserId: 'admin-3',
    });
    const byRule = await routing.listRuleChanges(created.id);
    expect(byRule).toHaveLength(3);
  });
});
