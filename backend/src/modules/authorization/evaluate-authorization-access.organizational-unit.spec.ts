import { authorizationRoleKeys, permissionKeys } from './authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
  createTestDecisionInput,
} from './create-test-authorization-context';
import { evaluateAuthorizationAccess } from './evaluate-authorization-access';

describe('evaluateAuthorizationAccess organizational unit scope', () => {
  const zenicaAssignment = createTestAssignment({
    roleKey: authorizationRoleKeys.admin,
    permissionKeys: [permissionKeys.routingWrite],
    organizationalUnitId: 'ou-zenica',
    organizationalUnitPath: '/Korisnici/ED Zenica',
  });

  it('inherits access to descendant units on the same assignment', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [zenicaAssignment],
          }),
          requiredPermissions: [permissionKeys.routingWrite],
          organizationalUnitId: 'ou-breza',
          organizationalUnitPath: '/Korisnici/ED Zenica/Breza',
          requireOrganizationalUnitScope: true,
        }),
      ),
    ).toBe(true);
  });

  it('denies ancestor and sibling units', () => {
    const context = createTestAuthorizationContext({
      assignments: [zenicaAssignment],
    });
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context,
          requiredPermissions: [permissionKeys.routingWrite],
          organizationalUnitId: 'ou-korisnici',
          organizationalUnitPath: '/Korisnici',
          requireOrganizationalUnitScope: true,
        }),
      ),
    ).toBe(false);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context,
          requiredPermissions: [permissionKeys.routingWrite],
          organizationalUnitId: 'ou-sarajevo',
          organizationalUnitPath: '/Korisnici/ED Sarajevo',
          requireOrganizationalUnitScope: true,
        }),
      ),
    ).toBe(false);
  });

  it('does not combine a permission from one OU with access from another', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [
              zenicaAssignment,
              createTestAssignment({
                roleKey: authorizationRoleKeys.agent,
                permissionKeys: [permissionKeys.ticketMerge],
                organizationalUnitId: 'ou-sarajevo',
                organizationalUnitPath: '/Korisnici/ED Sarajevo',
              }),
            ],
          }),
          requiredPermissions: [permissionKeys.routingWrite],
          organizationalUnitId: 'ou-sarajevo',
          organizationalUnitPath: '/Korisnici/ED Sarajevo',
          requireOrganizationalUnitScope: true,
        }),
      ),
    ).toBe(false);
  });

  it('does not treat an unscoped assignment as global OU access', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requiredPermissions: [permissionKeys.ticketMerge],
          organizationalUnitId: 'ou-zenica',
          organizationalUnitPath: '/Korisnici/ED Zenica',
          requireOrganizationalUnitScope: true,
        }),
      ),
    ).toBe(false);
  });

  it('lets SuperAdmin access any resolved OU', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            isLocalOnly: true,
            isSuperAdmin: true,
            assignments: [],
          }),
          requiredPermissions: [permissionKeys.routingWrite],
          organizationalUnitId: 'ou-zenica',
          organizationalUnitPath: '/Korisnici/ED Zenica',
          requireOrganizationalUnitScope: true,
        }),
      ),
    ).toBe(true);
  });
});
