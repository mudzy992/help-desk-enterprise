import { permissionKeys } from './authorization.constants';
import { authorizationDecisionReasons } from './authorization-decision-reason';
import { createTestAuthorizationContext } from './create-test-authorization-context';
import {
  createTestAuthorizationHarness,
  createTestAuthorizationRequirements,
  shadowTestPrincipal,
} from './create-test-authorization-harness';
import { shadowAuthorizationDecisions } from './shadow-authorization.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ShadowAuthorizationService SuperAdmin', () => {
  const harness = createTestAuthorizationHarness();

  beforeEach(() => {
    harness.loadBySubjectId.mockReset();
    harness.findOrganizationalUnit.mockReset();
    harness.findService.mockReset();
    harness.findOrganizationalUnit.mockResolvedValue({
      ouPath: '/Korisnici/ED Zenica',
    });
    harness.findService.mockResolvedValue({ id: 'service-hr' });
  });

  it('grants SuperAdmin globally after requested scopes resolve', async () => {
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        subjectId: 'super-admin-1',
        isLocalOnly: true,
        isSuperAdmin: true,
        assignments: [],
      }),
    );
    const report = await harness.shadowAuthorizationService.evaluate({
      principal: {
        ...shadowTestPrincipal,
        subjectId: 'super-admin-1',
        isLocalOnly: true,
      },
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.confidentialBreakGlass],
        requireOrganizationalUnitScope: true,
        requireServiceScope: true,
      }),
      organizationalUnitId: 'ou-zenica',
      serviceId: 'service-hr',
    });
    expect(report.decision).toBe(shadowAuthorizationDecisions.allow);
    expect(report.reason).toBe(authorizationDecisionReasons.superAdminAllowed);
    expect(report.considered.isSuperAdmin).toBe(true);
    expect(report.considered.isLocalOnly).toBe(true);
  });

  it('fails closed for SuperAdmin invariant violations and unknown scopes', async () => {
    harness.loadBySubjectId.mockResolvedValue(null);
    const missingContext = await harness.shadowAuthorizationService.evaluate({
      principal: { ...shadowTestPrincipal, subjectId: 'super-admin-1' },
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.settingsWrite],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        isLocalOnly: false,
        isSuperAdmin: true,
        assignments: [],
      }),
    );
    const notLocalOnly = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.settingsWrite],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        isLocalOnly: true,
        isSuperAdmin: true,
        assignments: [],
      }),
    );
    harness.findOrganizationalUnit.mockResolvedValue(null);
    const unknownOu = await harness.shadowAuthorizationService.evaluate({
      principal: { ...shadowTestPrincipal, isLocalOnly: true },
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.routingWrite],
        requireOrganizationalUnitScope: true,
      }),
      organizationalUnitId: 'missing-ou',
      serviceId: null,
    });
    expect(missingContext.reason).toBe(
      authorizationDecisionReasons.missingAuthorizationContext,
    );
    expect(notLocalOnly.reason).toBe(
      authorizationDecisionReasons.superAdminNotLocalOnly,
    );
    expect(unknownOu.reason).toBe(
      authorizationDecisionReasons.unknownOrganizationalUnit,
    );
    expect(unknownOu.decision).toBe(shadowAuthorizationDecisions.deny);
  });
});
