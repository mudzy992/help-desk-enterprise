import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { isRoutingTargetGroupEligible } from './routing-access-filter';

function viewer(input: {
  path: string | null;
  serviceId: string | null;
  permission?: string;
}): AuthorizationContext {
  return {
    subjectId: 'viewer-1',
    isLocalOnly: false,
    isSuperAdmin: false,
    assignments: [
      {
        roleKey: 'routing-admin',
        permissionKeys: [input.permission ?? permissionKeys.routingWrite],
        organizationalUnitId: 'ou-1',
        organizationalUnitPath: input.path,
        serviceId: input.serviceId,
      },
    ],
  };
}

describe('routing target group eligibility', () => {
  it('rejects a target group outside the viewer organizational-unit scope', () => {
    expect(
      isRoutingTargetGroupEligible(
        '/company/foreign',
        'service-1',
        viewer({ path: '/company/home', serviceId: 'service-1' }),
      ),
    ).toBe(false);
  });

  it('rejects a target group for a service outside the assignment scope', () => {
    expect(
      isRoutingTargetGroupEligible(
        '/company/home/team',
        'service-2',
        viewer({ path: '/company/home', serviceId: 'service-1' }),
      ),
    ).toBe(false);
  });

  it('rejects read-only assignments for routing mutations', () => {
    expect(
      isRoutingTargetGroupEligible(
        '/company/home',
        'service-1',
        viewer({
          path: '/company/home',
          serviceId: 'service-1',
          permission: permissionKeys.routingRead,
        }),
      ),
    ).toBe(false);
  });

  it('allows a globally scoped routing administrator to target every group', () => {
    expect(
      isRoutingTargetGroupEligible(
        '/company/foreign',
        'service-9',
        viewer({ path: null, serviceId: null }),
      ),
    ).toBe(true);
  });

  it('allows super administrators to target every group', () => {
    expect(
      isRoutingTargetGroupEligible('/company/foreign', 'service-9', {
        subjectId: 'global-admin',
        isLocalOnly: false,
        isSuperAdmin: true,
        assignments: [],
      }),
    ).toBe(true);
  });
});
