import type { PrincipalAssignment, PrincipalContext } from '../../common/principal-context/principal-context.types';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import {
  announcementAudienceUnitsCoveredByScope,
  announcementPermissionScopeFromAssignments,
  hasAnnouncementPermissionScope,
} from './announcement-permission-scope';
import { announcementViewerFromContext } from './announcement-viewer';

function assignment(input: Partial<PrincipalAssignment> & Pick<PrincipalAssignment, 'roleKey' | 'permissionKeys'>): PrincipalAssignment {
  return {
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    ...input,
  };
}

function context(input: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    subjectId: 'actor-1',
    email: 'actor@example.invalid',
    displayName: 'Actor',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    entraObjectId: null,
    roleKeys: [],
    groupIds: [],
    homeOrganizationalUnitId: null,
    assignments: [],
    authzVersion: 1,
    ...input,
  };
}

describe('announcement permission scope', () => {
  it('keeps explicit global manage and report grants separate', () => {
    const viewer = announcementViewerFromContext(context({
      assignments: [
        assignment({ roleKey: 'ADMIN', permissionKeys: [permissionKeys.announcementManage], scope: { kind: 'global' } }),
        assignment({ roleKey: 'ADMIN', permissionKeys: [permissionKeys.announcementReportRead], scope: { kind: 'global' } }),
      ],
    }), 'actor-1');

    expect(viewer.canManageAll).toBe(true);
    expect(viewer.canReadReports).toBe(true);
    expect(viewer.manageScope.global).toBe(true);
    expect(viewer.reportScope.global).toBe(true);
  });

  it('retains OU scope without turning a scoped grant into global access', () => {
    const viewer = announcementViewerFromContext(context({
      assignments: [assignment({
        roleKey: 'ADMIN',
        permissionKeys: [permissionKeys.announcementManage, permissionKeys.announcementReportRead],
        organizationalUnitId: 'ou-it',
        organizationalUnitPath: '/root/IT',
      })],
    }), 'actor-1');

    expect(viewer.canManageAll).toBe(false);
    expect(viewer.canReadReports).toBe(false);
    expect(viewer.manageScope.organizationalUnits).toEqual([
      { organizationalUnitId: 'ou-it', organizationalUnitPath: '/root/IT' },
    ]);
    expect(viewer.reportScope.organizationalUnits).toEqual(viewer.manageScope.organizationalUnits);
    expect(announcementAudienceUnitsCoveredByScope(['child', 'it'], new Map([
      ['child', '/root/IT/Support'],
      ['it', '/root/IT'],
    ]), viewer.manageScope)).toBe(true);
    expect(announcementAudienceUnitsCoveredByScope(['it', 'hr'], new Map([
      ['it', '/root/IT'],
      ['hr', '/root/HR'],
    ]), viewer.manageScope)).toBe(false);
  });

  it('keeps manage and report scopes independent', () => {
    const scopedViewer = announcementViewerFromContext(context({
      assignments: [
        assignment({
          roleKey: 'ADMIN',
          permissionKeys: [permissionKeys.announcementManage],
          organizationalUnitId: 'ou-it',
          organizationalUnitPath: '/root/IT',
        }),
        assignment({
          roleKey: 'ADMIN',
          permissionKeys: [permissionKeys.announcementReportRead],
          organizationalUnitId: 'ou-hr',
          organizationalUnitPath: '/root/HR',
        }),
      ],
    }), 'actor-1');

    expect(scopedViewer.manageScope.organizationalUnits).toEqual([
      { organizationalUnitId: 'ou-it', organizationalUnitPath: '/root/IT' },
    ]);
    expect(scopedViewer.reportScope.organizationalUnits).toEqual([
      { organizationalUnitId: 'ou-hr', organizationalUnitPath: '/root/HR' },
    ]);
    expect(scopedViewer.canManageAll).toBe(false);
    expect(scopedViewer.canReadReports).toBe(false);
  });

  it('does not treat a service-only grant as an announcement audience scope', () => {
    const scope = announcementPermissionScopeFromAssignments({
      assignments: [assignment({
        roleKey: 'ADMIN',
        permissionKeys: [permissionKeys.announcementManage, permissionKeys.announcementReportRead],
        serviceId: 'service-vpn',
      })],
      permissionKey: permissionKeys.announcementManage,
      isSuperAdmin: false,
      isLocalOnly: false,
    });
    const viewer = announcementViewerFromContext(context({
      assignments: [assignment({
        roleKey: 'ADMIN',
        permissionKeys: [permissionKeys.announcementManage, permissionKeys.announcementReportRead],
        serviceId: 'service-vpn',
      })],
    }), 'actor-1');

    expect(scope).toEqual({ global: false, organizationalUnits: [] });
    expect(hasAnnouncementPermissionScope(scope)).toBe(false);
    expect(viewer.canManageAll).toBe(false);
    expect(viewer.canReadReports).toBe(false);
    expect(hasAnnouncementPermissionScope(viewer.manageScope)).toBe(false);
    expect(hasAnnouncementPermissionScope(viewer.reportScope)).toBe(false);
  });

  it('fails closed when the explicit canonical scope disagrees with the stored fields', () => {
    const scope = announcementPermissionScopeFromAssignments({
      assignments: [assignment({
        roleKey: 'ADMIN',
        permissionKeys: [permissionKeys.announcementManage],
        organizationalUnitId: 'ou-it',
        organizationalUnitPath: '/root/IT',
        scope: { kind: 'organizational-unit', organizationalUnitId: 'ou-hr', organizationalUnitPath: '/root/HR' },
      })],
      permissionKey: permissionKeys.announcementManage,
      isSuperAdmin: false,
      isLocalOnly: false,
    });
    expect(scope).toEqual({ global: false, organizationalUnits: [] });
  });

  it('allows only a local SuperAdmin to receive the global bypass', () => {
    const local = announcementViewerFromContext(context({ isLocalOnly: true, roleKeys: [authorizationRoleKeys.superAdmin] }), 'root');
    const nonLocal = announcementViewerFromContext(context({ roleKeys: [authorizationRoleKeys.superAdmin] }), 'root');

    expect(local.manageScope.global).toBe(true);
    expect(local.reportScope.global).toBe(true);
    expect(nonLocal.manageScope.global).toBe(false);
    expect(nonLocal.reportScope.global).toBe(false);
  });
});
