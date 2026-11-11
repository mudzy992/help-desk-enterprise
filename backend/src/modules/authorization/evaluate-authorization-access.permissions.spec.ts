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
    // Explicit AND requirements do not become scope-agnostic through one permission.
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: scopedAgent,
          requiredPermissions: [permissionKeys.onCallRead, permissionKeys.routingWrite],
          permissionMatchMode: 'all',
        }),
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

  it('keeps RequirePermissions OR semantics and requires every permission in all mode on one assignment', () => {
    const first = permissionKeys.reportsExport;
    const second = permissionKeys.auditExport;
    const onePermission = createTestAuthorizationContext({
      assignments: [createTestAssignment({ permissionKeys: [first] })],
    });

    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: onePermission,
          requiredPermissions: [first, second],
          permissionMatchMode: 'any',
        }),
      ),
    ).toBe(true);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: onePermission,
          requiredPermissions: [first, second],
          permissionMatchMode: 'all',
        }),
      ),
    ).toBe(false);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [createTestAssignment({ permissionKeys: [first, second] })],
          }),
          requiredPermissions: [first, second],
          permissionMatchMode: 'all',
        }),
      ),
    ).toBe(true);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [
              createTestAssignment({ permissionKeys: [first] }),
              createTestAssignment({ permissionKeys: [second] }),
            ],
          }),
          requiredPermissions: [first, second],
          permissionMatchMode: 'all',
        }),
      ),
    ).toBe(false);
  });

  it('scopes group.manage to the target OU, with a deliberate unscoped global grant exception', () => {
    const groupManage = permissionKeys.groupManage;
    const scoped = createTestAuthorizationContext({
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.admin,
          permissionKeys: [groupManage],
          organizationalUnitId: 'ou-a',
          organizationalUnitPath: '/A',
        }),
      ],
    });
    const scopedRequest = createTestDecisionInput({
      context: scoped,
      requiredRoles: [authorizationRoleKeys.admin],
      requiredPermissions: [groupManage],
      organizationalUnitId: 'ou-a',
      organizationalUnitPath: '/A/Team',
      requireOrganizationalUnitScope: true,
    });
    expect(evaluateAuthorizationAccess(scopedRequest)).toBe(true);
    expect(
      evaluateAuthorizationAccess({
        ...scopedRequest,
        organizationalUnitId: 'ou-b',
        organizationalUnitPath: '/B',
      }),
    ).toBe(false);

    const global = createTestAuthorizationContext({
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.admin,
          permissionKeys: [groupManage],
        }),
      ],
    });
    expect(
      evaluateAuthorizationAccess({ ...scopedRequest, context: global }),
    ).toBe(true);
    const serviceScoped = createTestAuthorizationContext({
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.admin,
          permissionKeys: [groupManage],
          serviceId: 'service-a',
        }),
      ],
    });
    expect(
      evaluateAuthorizationAccess({ ...scopedRequest, context: serviceScoped }),
    ).toBe(false);
    expect(
      evaluateAuthorizationAccess({
        ...scopedRequest,
        context: createTestAuthorizationContext({
          assignments: [
            createTestAssignment({
              roleKey: authorizationRoleKeys.admin,
              permissionKeys: [permissionKeys.routingWrite],
            }),
          ],
        }),
      }),
    ).toBe(false);
  });
});
