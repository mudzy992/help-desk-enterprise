import { authorizationRoleKeys, permissionKeys } from './authorization.constants';
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

describe('ShadowAuthorizationService scopes and SuperAdmin', () => {
  const harness = createTestAuthorizationHarness();

  beforeEach(() => {
    harness.loadBySubjectId.mockReset();
    harness.findOrganizationalUnit.mockReset();
    harness.findService.mockReset();
    harness.loadBySubjectId.mockResolvedValue(createTestAuthorizationContext());
    harness.findOrganizationalUnit.mockResolvedValue({
      ouPath: '/Korisnici/ED Zenica',
    });
    harness.findService.mockResolvedValue({ id: 'service-hr' });
  });

  it('inherits OU access to descendants on the same assignment', async () => {
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.routingWrite],
            organizationalUnitId: 'ou-zenica',
            organizationalUnitPath: '/Korisnici/ED Zenica',
          }),
        ],
      }),
    );
    harness.findOrganizationalUnit.mockResolvedValue({
      ouPath: '/Korisnici/ED Zenica/Breza',
    });
    const report = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.routingWrite],
        organizationalUnitScope: { field: 'organizationalUnitId' },
        requireOrganizationalUnitScope: true,
      }),
      organizationalUnitId: 'ou-breza',
      serviceId: null,
    });
    expect(report.decision).toBe(shadowAuthorizationDecisions.allow);
    expect(report.requested.organizationalUnitPath).toBe(
      '/Korisnici/ED Zenica/Breza',
    );
    expect(report.considered.organizationalUnitScopes).toEqual([
      {
        organizationalUnitId: 'ou-zenica',
        organizationalUnitPath: '/Korisnici/ED Zenica',
      },
    ]);
  });

  it('shadow-denies ancestor, sibling, and prefix-collision OU paths', async () => {
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.routingWrite],
            organizationalUnitId: 'ou-zenica',
            organizationalUnitPath: '/Korisnici/ED Zenica',
          }),
        ],
      }),
    );
    const requirements = createTestAuthorizationRequirements({
      requiredPermissions: [permissionKeys.routingWrite],
      organizationalUnitScope: { field: 'organizationalUnitId' },
      requireOrganizationalUnitScope: true,
    });
    harness.findOrganizationalUnit.mockResolvedValue({ ouPath: '/Korisnici' });
    const ancestor = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements,
      organizationalUnitId: 'ou-korisnici',
      serviceId: null,
    });
    harness.findOrganizationalUnit.mockResolvedValue({
      ouPath: '/Korisnici/ED Sarajevo',
    });
    const sibling = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements,
      organizationalUnitId: 'ou-sarajevo',
      serviceId: null,
    });
    harness.findOrganizationalUnit.mockResolvedValue({
      ouPath: '/Korisnici/ED Zenica Extra',
    });
    const prefixCollision = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements,
      organizationalUnitId: 'ou-zenica-extra',
      serviceId: null,
    });
    expect(ancestor.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(sibling.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(prefixCollision.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(ancestor.reason).toBe(authorizationDecisionReasons.noMatchingAssignment);
  });

  it('fails closed for missing or unknown OU and service scope', async () => {
    const ouRequirements = createTestAuthorizationRequirements({
      requiredPermissions: [permissionKeys.routingWrite],
      requireOrganizationalUnitScope: true,
    });
    const missingOu = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: ouRequirements,
      organizationalUnitId: null,
      serviceId: null,
    });
    harness.findOrganizationalUnit.mockResolvedValue(null);
    const unknownOu = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: ouRequirements,
      organizationalUnitId: 'missing-ou',
      serviceId: null,
    });
    const serviceRequirements = createTestAuthorizationRequirements({
      requiredPermissions: [permissionKeys.serviceFormsWrite],
      requireServiceScope: true,
    });
    const missingService = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: serviceRequirements,
      organizationalUnitId: null,
      serviceId: null,
    });
    harness.findService.mockResolvedValue(null);
    const unknownService = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: serviceRequirements,
      organizationalUnitId: null,
      serviceId: 'missing-service',
    });
    const invalidTokens = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: ['   '],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(missingOu.reason).toBe(
      authorizationDecisionReasons.missingOrganizationalUnitScope,
    );
    expect(unknownOu.reason).toBe(
      authorizationDecisionReasons.unknownOrganizationalUnit,
    );
    expect(missingService.reason).toBe(
      authorizationDecisionReasons.missingServiceScope,
    );
    expect(unknownService.reason).toBe(authorizationDecisionReasons.unknownService);
    expect(invalidTokens.reason).toBe(
      authorizationDecisionReasons.invalidRequirementTokens,
    );
    expect(missingOu.decision).toBe(shadowAuthorizationDecisions.deny);
  });
});
