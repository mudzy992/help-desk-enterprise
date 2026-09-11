import { allPermissionKeys, permissionKeys } from './authorization.constants';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import type { AuthorizationContext } from './authorization.types';
import { toCurrentSessionResponse } from './to-current-session-response';

const principal: AuthorizationPrincipal = {
  subjectId: 'user-1',
  email: 'admin@example.com',
  displayName: 'Super Admin',
  isLocalOnly: true,
};

describe('toCurrentSessionResponse', () => {
  it('reports the full permission set for a SuperAdmin', () => {
    const context: AuthorizationContext = {
      subjectId: 'user-1',
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [
        {
          roleKey: 'SUPER_ADMIN',
          permissionKeys: [],
          organizationalUnitId: null,
          organizationalUnitPath: null,
          serviceId: null,
        },
      ],
    };
    const response = toCurrentSessionResponse(principal, context);
    expect(response.isSuperAdmin).toBe(true);
    expect(response.roleKeys).toEqual(['SUPER_ADMIN']);
    expect(response.permissionKeys).toHaveLength(allPermissionKeys.length);
    expect(response.permissionKeys).toContain(permissionKeys.serviceFormsWrite);
  });

  it('deduplicates permissions granted through several scoped assignments', () => {
    const context: AuthorizationContext = {
      subjectId: 'user-1',
      isLocalOnly: false,
      isSuperAdmin: false,
      assignments: [
        {
          roleKey: 'AGENT',
          permissionKeys: [permissionKeys.ticketAttachmentsUpload],
          organizationalUnitId: 'ou-1',
          organizationalUnitPath: '/IT',
          serviceId: null,
        },
        {
          roleKey: 'AGENT',
          permissionKeys: [permissionKeys.ticketAttachmentsUpload],
          organizationalUnitId: 'ou-2',
          organizationalUnitPath: '/HR',
          serviceId: null,
        },
      ],
    };
    const response = toCurrentSessionResponse(principal, context);
    expect(response.roleKeys).toEqual(['AGENT']);
    expect(response.permissionKeys).toEqual([
      permissionKeys.ticketAttachmentsUpload,
    ]);
  });

  it('returns an empty capability set when no authorization context exists', () => {
    const response = toCurrentSessionResponse(principal, null);
    expect(response.isSuperAdmin).toBe(false);
    expect(response.roleKeys).toEqual([]);
    expect(response.permissionKeys).toEqual([]);
    expect(response.principal.subjectId).toBe('user-1');
  });
});
