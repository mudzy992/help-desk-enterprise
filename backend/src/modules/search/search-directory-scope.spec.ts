import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import {
  resolveDirectorySearchGrant,
  resolveDirectorySearchScope,
} from './search-directory-scope';

const units = [
  { id: 'ou-root', ouPath: '/Korisnici' },
  { id: 'ou-it', ouPath: '/Korisnici/IT' },
  { id: 'ou-it-support', ouPath: '/Korisnici/IT/Support' },
  { id: 'ou-hr', ouPath: '/Korisnici/HR' },
];

const scopedAdmin = createTestAuthorizationContext({
  subjectId: 'admin-it',
  assignments: [
    createTestAssignment({
      roleKey: authorizationRoleKeys.admin,
      organizationalUnitId: 'ou-it',
      organizationalUnitPath: '/Korisnici/IT',
      permissionKeys: [],
    }),
  ],
});

describe('directory search grant (W7.55 / BA-search-01)', () => {
  it('is closed for a caller that holds neither the permission nor ADMIN', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            organizationalUnitId: 'ou-it',
            organizationalUnitPath: '/Korisnici/IT',
          }),
        ],
      }),
    );
    expect(grant).toEqual({ kind: 'none' });
    expect(
      resolveDirectorySearchScope({ grant, organizationalUnits: units }),
    ).toEqual({ kind: 'none' });
  });

  it('is closed for a caller authorization does not know', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({ assignments: [] }),
    );
    expect(grant).toEqual({ kind: 'none' });
  });

  it('opens the whole directory, with e-mail, to SUPER_ADMIN', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        isSuperAdmin: true,
        assignments: [
          createTestAssignment({ roleKey: authorizationRoleKeys.superAdmin }),
        ],
      }),
    );
    expect(grant).toEqual({ kind: 'everyone', includeEmail: true });
  });

  it('limits an ADMIN to the subtree of its assignment, without e-mail', () => {
    const grant = resolveDirectorySearchGrant(scopedAdmin);
    expect(grant).toEqual({
      kind: 'organizationalUnits',
      organizationalUnitPaths: ['/Korisnici/IT'],
    });
    // The subtree, not just the unit: a child unit is inside the scope, the
    // sibling HR unit and the root are not.
    expect(
      resolveDirectorySearchScope({ grant, organizationalUnits: units }),
    ).toEqual({
      kind: 'organizationalUnits',
      organizationalUnitIds: ['ou-it', 'ou-it-support'],
    });
  });

  it('keeps the pre-W7.55 reach of an unscoped ADMIN, still without e-mail', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [],
          }),
        ],
      }),
    );
    expect(grant).toEqual({ kind: 'everyone', includeEmail: false });
  });

  it('honours the explicit permission without e-mail when it is unit-scoped', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            organizationalUnitId: 'ou-hr',
            organizationalUnitPath: '/Korisnici/HR',
            permissionKeys: [permissionKeys.userDirectoryRead],
          }),
        ],
      }),
    );
    expect(grant).toEqual({
      kind: 'organizationalUnits',
      organizationalUnitPaths: ['/Korisnici/HR'],
    });
    expect(
      resolveDirectorySearchScope({ grant, organizationalUnits: units }),
    ).toEqual({ kind: 'organizationalUnits', organizationalUnitIds: ['ou-hr'] });
  });

  it('opens the whole directory only for an explicitly unscoped grant', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            permissionKeys: [permissionKeys.userDirectoryRead],
          }),
        ],
      }),
    );
    expect(grant).toEqual({ kind: 'everyone', includeEmail: true });
  });

  it('never treats a service-scoped grant as a global one', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            serviceId: 'service-vpn',
            permissionKeys: [permissionKeys.userDirectoryRead],
          }),
        ],
      }),
    );
    expect(grant).toEqual({ kind: 'none' });
  });

  it('fails closed for assignments that name a unit but no path', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            organizationalUnitId: 'ou-it',
            organizationalUnitPath: '   ',
            permissionKeys: [],
          }),
        ],
      }),
    );
    expect(grant).toEqual({ kind: 'none' });
    expect(
      resolveDirectorySearchScope({ grant, organizationalUnits: units }),
    ).toEqual({ kind: 'none' });
  });

  it('fails closed when no unit matches the assigned path', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            organizationalUnitId: 'ou-gone',
            organizationalUnitPath: '/Korisnici/Nepostojeci',
            permissionKeys: [],
          }),
        ],
      }),
    );
    expect(
      resolveDirectorySearchScope({ grant, organizationalUnits: units }),
    ).toEqual({ kind: 'none' });
  });

  it('unions several assignments and reads each subtree once', () => {
    const grant = resolveDirectorySearchGrant(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            organizationalUnitId: 'ou-it',
            organizationalUnitPath: '/Korisnici/IT',
            permissionKeys: [],
          }),
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            organizationalUnitId: 'ou-hr',
            organizationalUnitPath: '/Korisnici/HR',
            permissionKeys: [],
          }),
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            organizationalUnitId: 'ou-it',
            organizationalUnitPath: '/Korisnici/IT',
            permissionKeys: [permissionKeys.userDirectoryRead],
          }),
        ],
      }),
    );
    expect(grant).toEqual({
      kind: 'organizationalUnits',
      organizationalUnitPaths: ['/Korisnici/IT', '/Korisnici/HR'],
    });
    expect(
      resolveDirectorySearchScope({ grant, organizationalUnits: units }),
    ).toEqual({
      kind: 'organizationalUnits',
      organizationalUnitIds: ['ou-hr', 'ou-it', 'ou-it-support'],
    });
  });
});
