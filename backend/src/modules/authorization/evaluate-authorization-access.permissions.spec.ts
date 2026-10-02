import { authorizationRoleKeys, permissionKeys } from './authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
  createTestDecisionInput,
} from './create-test-authorization-context';
import { evaluateAuthorizationAccess } from './evaluate-authorization-access';

describe('evaluateAuthorizationAccess permissions and roles', () => {
  it('grants a permission from an unscoped assignment', () => {
    expect(evaluateAuthorizationAccess(createTestDecisionInput())).toBe(true);
  });

  it('denies a permission the assignment does not include', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requiredPermissions: [permissionKeys.routingWrite],
        }),
      ),
    ).toBe(false);
  });

  it('grants a role that exists on any assignment', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          requiredRoles: [authorizationRoleKeys.agent],
          requiredPermissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('does not let an OU-scoped permission satisfy an unscoped check', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                permissionKeys: [permissionKeys.routingWrite],
                organizationalUnitId: 'ou-zenica',
                organizationalUnitPath: '/Korisnici/Podružnica Zenica',
              }),
            ],
          }),
          requiredPermissions: [permissionKeys.routingWrite],
        }),
      ),
    ).toBe(false);
  });

  it('lets an OU-scoped agent read the shared on-call calendar (scope-agnostic permission)', () => {
    const scopedAgent = createTestAuthorizationContext({
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.agent,
          permissionKeys: [permissionKeys.onCallRead],
          organizationalUnitId: 'ou-zenica',
          organizationalUnitPath: '/Korisnici/Podružnica Zenica',
        }),
      ],
    });
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({ context: scopedAgent, requiredPermissions: [permissionKeys.onCallRead] }),
      ),
    ).toBe(true);
    // Managing stays fail-closed for scoped assignments.
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                permissionKeys: [permissionKeys.onCallManage],
                organizationalUnitId: 'ou-zenica',
                organizationalUnitPath: '/Korisnici/Podružnica Zenica',
              }),
            ],
          }),
          requiredPermissions: [permissionKeys.onCallManage],
        }),
      ),
    ).toBe(false);
    // A mixed requirement is not scope-agnostic.
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({ context: scopedAgent, requiredPermissions: [permissionKeys.onCallRead, permissionKeys.routingWrite] }),
      ),
    ).toBe(false);
  });

  it('grants SuperAdmin every well-formed permission and role', () => {
    const superAdmin = createTestAuthorizationContext({
      subjectId: 'super-admin-1',
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [],
    });
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: superAdmin,
          requiredRoles: [authorizationRoleKeys.admin],
          requiredPermissions: [permissionKeys.confidentialBreakGlass],
        }),
      ),
    ).toBe(true);
  });

  it('keeps SuperAdmin global access from depending on a provider field', () => {
    const superAdmin = createTestAuthorizationContext({
      subjectId: 'super-admin-1',
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [],
    });
    expect(superAdmin).not.toHaveProperty('provider');
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: superAdmin,
          requiredPermissions: [permissionKeys.settingsWrite],
        }),
      ),
    ).toBe(true);
  });
});
