import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { statusViewerFromContext } from './status-viewer';

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
