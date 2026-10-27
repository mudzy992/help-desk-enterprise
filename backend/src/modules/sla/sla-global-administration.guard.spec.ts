import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PRINCIPAL_CONTEXT_REQUEST_KEY } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import { SlaGlobalAdministrationGuard } from './sla-global-administration.guard';

const guard = new SlaGlobalAdministrationGuard();

function context(input: {
  method: string;
  roleKeys?: readonly string[];
  organizationalUnitId?: string | null;
  serviceId?: string | null;
  permissionKeys?: readonly string[];
}): ExecutionContext {
  const request = {
    method: input.method,
    [PRINCIPAL_CONTEXT_REQUEST_KEY]: {
      subjectId: 'admin-1', email: 'admin@example.test', displayName: 'Admin',
      isActive: true, isLocalOnly: true, mustChangePassword: false,
      entraObjectId: null, roleKeys: input.roleKeys ?? [authorizationRoleKeys.admin],
      groupIds: [], homeOrganizationalUnitId: null, authzVersion: 1,
      assignments: [{
        roleKey: authorizationRoleKeys.admin,
        permissionKeys: input.permissionKeys ?? [permissionKeys.slaWrite],
        organizationalUnitId: input.organizationalUnitId ?? null,
        organizationalUnitPath: input.organizationalUnitId ? '/Scoped' : null,
        serviceId: input.serviceId ?? null,
      }],
    },
  };
  return { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
}

describe('SlaGlobalAdministrationGuard', () => {
  it.each([
    ['OU-scoped rule create', context({ method: 'POST', organizationalUnitId: 'ou-foreign' })],
    ['service-scoped profile update', context({ method: 'PATCH', serviceId: 'service-foreign' })],
    ['OU-scoped list/change-log read', context({ method: 'GET', organizationalUnitId: 'ou-foreign' })],
    ['global mutation assignment without sla.write', context({ method: 'DELETE', permissionKeys: [] })],
  ])('denies %s', (_label, execution) => {
    expect(() => guard.canActivate(execution)).toThrow(ForbiddenException);
  });

  it('allows a global assignment with the operation permission', () => {
    expect(guard.canActivate(context({ method: 'POST' }))).toBe(true);
    expect(guard.canActivate(context({ method: 'GET' }))).toBe(true);
  });

  it('preserves the explicit SuperAdmin bypass', () => {
    expect(guard.canActivate(context({ method: 'DELETE', roleKeys: [authorizationRoleKeys.superAdmin], permissionKeys: [] }))).toBe(true);
  });
});
