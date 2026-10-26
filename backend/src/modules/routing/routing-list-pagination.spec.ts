import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import {
  createRoutingServiceHarness,
  routingChangeReason,
} from './create-routing-service-harness';

function scopedViewer(): AuthorizationContext {
  return {
    subjectId: 'scoped-reader',
    isLocalOnly: false,
    isSuperAdmin: false,
    assignments: [{
      roleKey: 'routing-reader',
      permissionKeys: [permissionKeys.routingRead],
      organizationalUnitId: 'ou-child',
      organizationalUnitPath: '/Korisnici/Direkcija',
      serviceId: 'service-vpn',
    }],
  };
}

describe('routing bounded list pagination', () => {
  it('paginates scoped rules with stable totals and no foreign OU rows', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-root', serviceId: 'service-vpn', groupId: 'group-net', reason: routingChangeReason,
    });
    await routing.createRule({
      originUnitId: 'ou-child', serviceId: 'service-vpn', groupId: 'group-net', reason: routingChangeReason,
    });
    await routing.createRule({
      originUnitId: 'ou-leaf', serviceId: 'service-vpn', groupId: 'group-it', reason: routingChangeReason,
    });

    const first = await routing.listRules({ take: 1 }, scopedViewer());
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    expect(first.items[0]?.originUnitId).not.toBe('ou-root');

    const second = await routing.listRules({
      take: 1,
      cursor: first.nextCursor ?? undefined,
    }, scopedViewer());
    expect(second.total).toBe(2);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('paginates change logs and rejects malformed cursors', async () => {
    const { routing, viewer } = createRoutingServiceHarness();
    await routing.createRule(
      { originUnitId: 'ou-child', serviceId: 'service-vpn', groupId: 'group-net', reason: routingChangeReason },
      { actorUserId: 'admin-1' },
    );
    await routing.createRule(
      { originUnitId: 'ou-leaf', serviceId: 'service-vpn', groupId: 'group-it', reason: routingChangeReason },
      { actorUserId: 'admin-2' },
    );

    const first = await routing.listChanges({ take: 1 }, viewer);
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    const second = await routing.listChanges({
      take: 1,
      cursor: first.nextCursor ?? undefined,
    }, viewer);
    expect(second.total).toBe(2);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);

    await expect(routing.listRules({ cursor: 'invalid' }, viewer)).rejects.toMatchObject({ status: 400 });
    await expect(routing.listChanges({ cursor: 'invalid' }, viewer)).rejects.toMatchObject({ status: 400 });
  });

  it('does not expose foreign-rule logs to a scoped viewer', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule(
      { originUnitId: 'ou-root', serviceId: 'service-vpn', groupId: 'group-net', reason: routingChangeReason },
      { actorUserId: 'admin-root' },
    );
    await routing.createRule(
      { originUnitId: 'ou-leaf', serviceId: 'service-vpn', groupId: 'group-it', reason: routingChangeReason },
      { actorUserId: 'admin-leaf' },
    );

    const page = await routing.listChanges({}, scopedViewer());
    expect(page.total).toBe(1);
    expect(page.items.map((entry) => entry.actorUserId)).toEqual(['admin-leaf']);
  });
});
