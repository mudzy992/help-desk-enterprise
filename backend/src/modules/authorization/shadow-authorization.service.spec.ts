import {
  authorizationRoleKeys,
  defaultRolePermissionKeys,
  permissionKeys,
} from './authorization.constants';
import { authorizationDecisionReasons } from './authorization-decision-reason';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from './create-test-authorization-context';
import {
  createTestAuthorizationHarness,
  createTestAuthorizationRequirements,
  shadowTestPrincipal,
} from './create-test-authorization-harness';
import { shadowAuthorizationDecisions } from './shadow-authorization.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ShadowAuthorizationService', () => {
  const harness = createTestAuthorizationHarness();

  beforeEach(() => {
    harness.loadBySubjectId.mockReset();
    harness.findOrganizationalUnit.mockReset();
    harness.findService.mockReset();
    harness.loadBySubjectId.mockResolvedValue(createTestAuthorizationContext());
    harness.findService.mockResolvedValue({ id: 'service-hr' });
  });

  it('shadow-allows a valid unscoped permission', async () => {
    const report = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.ticketMerge],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(report).toMatchObject({
      kind: 'shadow',
      isEnforcing: false,
      decision: shadowAuthorizationDecisions.allow,
      reason: authorizationDecisionReasons.assignmentAllowed,
    });
    expect(report.requested.permissionKeys).toEqual([permissionKeys.ticketMerge]);
    expect(report.considered.permissionKeys).toEqual([permissionKeys.ticketMerge]);
    expect(report.considered.roleKeys).toEqual([authorizationRoleKeys.agent]);
  });

  it('shadow-denies a permission the assignment does not include', async () => {
    const report = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.settingsWrite],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(report.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(report.reason).toBe(authorizationDecisionReasons.noMatchingAssignment);
    expect(report.isEnforcing).toBe(false);
  });

  it('uses role-assignment permission keys rather than the default role catalog', async () => {
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.user,
            permissionKeys: [
              ...(defaultRolePermissionKeys[authorizationRoleKeys.agent] ?? []),
            ],
          }),
        ],
      }),
    );
    const allowed = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.ticketMerge],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    const denied = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.settingsWrite],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(allowed.decision).toBe(shadowAuthorizationDecisions.allow);
    expect(allowed.considered.roleKeys).toEqual([authorizationRoleKeys.user]);
    expect(denied.decision).toBe(shadowAuthorizationDecisions.deny);
  });

  it('shadow-allows and shadow-denies matching service scope', async () => {
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            permissionKeys: [permissionKeys.serviceFormsWrite],
            serviceId: 'service-hr',
          }),
        ],
      }),
    );
    const requirements = createTestAuthorizationRequirements({
      requiredPermissions: [permissionKeys.serviceFormsWrite],
      serviceScope: { field: 'serviceId' },
      requireServiceScope: true,
    });
    const allowed = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements,
      organizationalUnitId: null,
      serviceId: 'service-hr',
    });
    harness.findService.mockResolvedValue({ id: 'service-it' });
    const denied = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements,
      organizationalUnitId: null,
      serviceId: 'service-it',
    });
    expect(allowed.decision).toBe(shadowAuthorizationDecisions.allow);
    expect(allowed.requested.serviceId).toBe('service-hr');
    expect(allowed.considered.serviceIds).toEqual(['service-hr']);
    expect(denied.decision).toBe(shadowAuthorizationDecisions.deny);
  });
});
