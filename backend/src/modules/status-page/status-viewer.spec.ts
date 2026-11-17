import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { statusViewerFromAuthorizationContext, statusViewerFromContext } from './status-viewer';
import type { AuthorizationContext } from '../authorization/authorization.types';

function context(roleKeys: string[], permissionKeys: string[] = [], scope: { organizationalUnitId?: string; organizationalUnitPath?: string; serviceId?: string } = {}): PrincipalContext {
  return {
    subjectId: 'u1',
    roleKeys,
    assignments: roleKeys.map((roleKey) => ({ roleKey, permissionKeys, organizationalUnitId: scope.organizationalUnitId ?? null, organizationalUnitPath: scope.organizationalUnitPath ?? null, serviceId: scope.serviceId ?? null })),
  } as unknown as PrincipalContext;
}

describe('statusViewerFromContext', () => {
  it('treats a missing context as a plain requester', () => {
    expect(statusViewerFromContext(null, 'u1')).toEqual({ userId: 'u1', isStaff: false, canManage: false, staffScope: null });
  });

  it('USER sees only public incidents', () => {
    expect(statusViewerFromContext(context(['USER']), 'u1')).toMatchObject({ isStaff: false, canManage: false });
  });

  it('AGENT is staff but does not manage without the permission', () => {
    expect(statusViewerFromContext(context(['AGENT']), 'u1')).toMatchObject({ isStaff: true, canManage: false });
    expect(statusViewerFromContext(context(['AGENT'], ['status.incidents.manage']), 'u1')).toMatchObject({ canManage: true });
  });

  it('keeps scoped AGENT visibility limited to its service or OU subtree', () => {
    expect(statusViewerFromContext(context(['AGENT'], [], { serviceId: 'service-a' }), 'u1')).toMatchObject({
      isStaff: true,
      staffScope: { global: false, serviceIds: ['service-a'], organizationalUnitPaths: [] },
    });
    expect(statusViewerFromContext(context(['AGENT'], [], { organizationalUnitId: 'ou-a', organizationalUnitPath: '/root/a' }), 'u1')).toMatchObject({
      staffScope: { global: false, serviceIds: [], organizationalUnitPaths: ['/root/a'] },
    });
  });

  it('SUPER_ADMIN manages implicitly with global staff visibility', () => {
    expect(statusViewerFromContext(context(['SUPER_ADMIN']), 'u1')).toMatchObject({ isStaff: true, canManage: true, staffScope: { global: true } });
  });
});

/** W7.29: other modules reach the status page through the authorization context. */
describe('statusViewerFromAuthorizationContext', () => {
  const assignment = (overrides: Partial<AuthorizationContext['assignments'][number]> = {}) => ({
    roleKey: 'AGENT',
    permissionKeys: ['status.incidents.read'],
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    ...overrides,
  });
  const authorization = (overrides: Partial<AuthorizationContext> = {}): AuthorizationContext => ({
    subjectId: 'u1',
    isLocalOnly: true,
    isSuperAdmin: false,
    assignments: [assignment()],
    ...overrides,
  });

  it('treats a missing context as a plain requester', () => {
    expect(statusViewerFromAuthorizationContext(null, 'u1')).toEqual({ userId: 'u1', isStaff: false, canManage: false, staffScope: null });
  });

  it('derives the same staff scope as the HTTP viewer', () => {
    expect(statusViewerFromAuthorizationContext(authorization({ assignments: [assignment({ serviceId: 'service-a' })] }), 'u1')).toMatchObject({
      isStaff: true,
      staffScope: { global: false, serviceIds: ['service-a'], organizationalUnitPaths: [] },
    });
    expect(statusViewerFromAuthorizationContext(authorization({ assignments: [assignment({ organizationalUnitId: 'ou-a', organizationalUnitPath: '/root/a' })] }), 'u1')).toMatchObject({
      staffScope: { global: false, serviceIds: [], organizationalUnitPaths: ['/root/a'] },
    });
  });

  it('keeps a non-staff user out of restricted incidents', () => {
    expect(statusViewerFromAuthorizationContext(authorization({ assignments: [assignment({ roleKey: 'USER' })] }), 'u1')).toMatchObject({
      isStaff: false,
      staffScope: null,
    });
  });

  it('gives a super admin global visibility and management', () => {
    expect(statusViewerFromAuthorizationContext(authorization({ isSuperAdmin: true, assignments: [] }), 'u1')).toMatchObject({
      isStaff: true,
      canManage: true,
      staffScope: { global: true },
    });
  });

  it('reads the management permission from the assignments', () => {
    expect(
      statusViewerFromAuthorizationContext(authorization({ assignments: [assignment({ permissionKeys: ['status.incidents.manage'] })] }), 'u1'),
    ).toMatchObject({ canManage: true });
  });
});
