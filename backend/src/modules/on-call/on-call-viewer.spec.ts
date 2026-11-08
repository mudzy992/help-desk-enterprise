import type { PrincipalAssignment, PrincipalContext } from '../../common/principal-context/principal-context.types';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import { canManageOnCallGroup, canReadOnCallGroup, onCallViewerFromContext } from './on-call-viewer';

function assignment(input: Partial<PrincipalAssignment> & Pick<PrincipalAssignment, 'roleKey' | 'permissionKeys'>): PrincipalAssignment {
  return {
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    ...input,
  };
}

function context(assignments: readonly PrincipalAssignment[], roleKeys: readonly string[] = []): PrincipalContext {
  return {
    subjectId: 'actor-1',
    email: 'actor@example.invalid',
    displayName: 'Actor',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    entraObjectId: null,
    roleKeys,
    groupIds: [],
    homeOrganizationalUnitId: null,
    assignments,
    authzVersion: 1,
  };
}

describe('onCallViewerFromContext group scope', () => {
  it('unions read and manage grants for reads but keeps write scope manager-only', () => {
    const viewer = onCallViewerFromContext(context([
      assignment({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.onCallRead],
        organizationalUnitId: 'ou-it',
        organizationalUnitPath: '/root/IT',
      }),
      assignment({
        roleKey: authorizationRoleKeys.admin,
        permissionKeys: [permissionKeys.onCallManage],
        organizationalUnitId: 'ou-hr',
        organizationalUnitPath: '/root/HR',
      }),
    ]), 'actor-1');

    expect(viewer).toMatchObject({ canRead: true, canManage: true });
    expect(canReadOnCallGroup(viewer, '/root/IT/Support')).toBe(true);
    expect(canReadOnCallGroup(viewer, '/root/HR')).toBe(true);
    expect(canReadOnCallGroup(viewer, '/root/ITX')).toBe(false);
    expect(canReadOnCallGroup(viewer, '/root/Finance')).toBe(false);
    expect(canManageOnCallGroup(viewer, '/root/HR/Payroll')).toBe(true);
    expect(canManageOnCallGroup(viewer, '/root/IT')).toBe(false);
  });

  it('does not map service-only assignments to groups that have no service relation', () => {
    const viewer = onCallViewerFromContext(context([
      assignment({
        roleKey: authorizationRoleKeys.admin,
        permissionKeys: [permissionKeys.onCallManage],
        serviceId: 'service-vpn',
      }),
    ]), 'actor-1');

    expect(viewer).toMatchObject({ canRead: true, canManage: true });
    expect(canReadOnCallGroup(viewer, '/root/IT')).toBe(false);
    expect(canManageOnCallGroup(viewer, '/root/IT')).toBe(false);
  });

  it('allows explicit unscoped grants globally and treats SuperAdmin as global', () => {
    const globalReader = onCallViewerFromContext(context([
      assignment({ roleKey: authorizationRoleKeys.agent, permissionKeys: [permissionKeys.onCallRead] }),
    ]), 'actor-1');
    expect(canReadOnCallGroup(globalReader, '/root/IT')).toBe(true);

    const superAdmin = onCallViewerFromContext(context([], [authorizationRoleKeys.superAdmin]), 'root-1');
    expect(superAdmin).toMatchObject({ canRead: true, canManage: true });
    expect(canManageOnCallGroup(superAdmin, '/root/HR')).toBe(true);
  });

  it('fails closed when the stored canonical scope conflicts with its legacy scope fields', () => {
    const viewer = onCallViewerFromContext(context([
      assignment({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.onCallRead],
        organizationalUnitId: 'ou-it',
        organizationalUnitPath: '/root/IT',
        scope: { kind: 'organizational-unit', organizationalUnitId: 'ou-hr', organizationalUnitPath: '/root/HR' },
      }),
    ]), 'actor-1');

    expect(canReadOnCallGroup(viewer, '/root/IT')).toBe(false);
    expect(canReadOnCallGroup(viewer, '/root/HR')).toBe(false);
  });
});
