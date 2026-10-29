import { ForbiddenException } from '@nestjs/common';
import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import {
  createRoutingServiceHarness,
  routingChangeReason,
} from './create-routing-service-harness';

function scopedViewer(input: {
  subjectId: string;
  path: string | null;
  serviceId: string | null;
}): AuthorizationContext {
  return {
    subjectId: input.subjectId,
    isLocalOnly: false,
    isSuperAdmin: false,
    assignments: [{
      roleKey: 'routing-admin',
      permissionKeys: [permissionKeys.routingRead, permissionKeys.routingWrite],
      organizationalUnitId: 'ou-child',
      organizationalUnitPath: input.path,
      serviceId: input.serviceId,
    }],
  };
}

describe('RoutingService target-group authorization', () => {
  it('rejects create with a target group outside the actor OU scope', async () => {
    const { routing, registerViewer } = createRoutingServiceHarness();
    const actor = scopedViewer({
      subjectId: 'scoped-admin',
      path: '/Korisnici/Direkcija/IT',
      serviceId: 'service-vpn',
    });
    registerViewer(actor);

    await expect(routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-net',
      reason: routingChangeReason,
    }, { actorUserId: actor.subjectId })).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'ROUTING_TARGET_GROUP_FORBIDDEN',
    });
  });

  it('uses the same target eligibility contract for update', async () => {
    const { routing, registerViewer } = createRoutingServiceHarness();
    const created = await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const actor = scopedViewer({
      subjectId: 'scoped-admin',
      path: '/Korisnici/Direkcija/IT',
      serviceId: 'service-vpn',
    });
    registerViewer(actor);

    await expect(routing.updateRule(created.id, {
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-net',
      reason: routingChangeReason,
      expectedUpdatedAt: created.updatedAt,
    }, { actorUserId: actor.subjectId })).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'ROUTING_TARGET_GROUP_FORBIDDEN',
    });
  });

  it('returns only groups eligible for the scoped viewer', async () => {
    const { routing } = createRoutingServiceHarness();
    const viewer = scopedViewer({
      subjectId: 'scoped-admin',
      path: '/Korisnici/Direkcija/IT',
      serviceId: 'service-vpn',
    });

    await expect(routing.listHandlerGroups(viewer)).resolves.toEqual([
      { id: 'group-it', name: 'IT Support' },
    ]);
  });

  it('keeps every target group available to a global administrator', async () => {
    const { routing, viewer } = createRoutingServiceHarness();

    await expect(routing.listHandlerGroups(viewer)).resolves.toEqual([
      { id: 'group-it', name: 'IT Support' },
      { id: 'group-net', name: 'Network Ops' },
    ]);
  });
});
