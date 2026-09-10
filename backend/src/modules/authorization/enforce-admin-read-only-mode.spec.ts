import { ForbiddenException } from '@nestjs/common';
import { authorizationRoleKeys, permissionKeys } from './authorization.constants';
import { createTestAuthorizationContext } from './create-test-authorization-context';
import {
  createTestAuthorizationHarness,
  createTestAuthorizationRequirements,
  shadowTestPrincipal,
} from './create-test-authorization-harness';
import { enforceAdminReadOnlyMode } from './enforce-admin-read-only-mode';
import { parseReadOnlyModeConfiguration } from './parse-read-only-mode-configuration';
import {
  adminReadOnlyModuleKeys,
  defaultAdminReadOnlyLockableModulesCsv,
  readOnlyModeErrorCodes,
} from './read-only-mode.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('enforceAdminReadOnlyMode', () => {
  const lockedConfiguration = parseReadOnlyModeConfiguration({
    enabled: true,
    modulesCsv: defaultAdminReadOnlyLockableModulesCsv,
    activeModulesCsv: adminReadOnlyModuleKeys.admin,
    bypassRolesCsv: authorizationRoleKeys.superAdmin,
  });
  const disabledConfiguration = parseReadOnlyModeConfiguration({
    enabled: false,
    modulesCsv: defaultAdminReadOnlyLockableModulesCsv,
    activeModulesCsv: adminReadOnlyModuleKeys.admin,
    bypassRolesCsv: authorizationRoleKeys.superAdmin,
  });

  it('does not block mutations when the mode is disabled', async () => {
    await expect(
      enforceAdminReadOnlyMode({
        route: {
          moduleKey: adminReadOnlyModuleKeys.admin,
          isMutation: true,
        },
        principal: shadowTestPrincipal,
        loadConfiguration: async () => disabledConfiguration,
        loadAuthorizationContext: async () => createTestAuthorizationContext(),
      }),
    ).resolves.toBeUndefined();
  });

  it('blocks mutations when the mode is enabled', async () => {
    await expect(
      enforceAdminReadOnlyMode({
        route: {
          moduleKey: adminReadOnlyModuleKeys.settings,
          isMutation: true,
        },
        principal: shadowTestPrincipal,
        loadConfiguration: async () => lockedConfiguration,
        loadAuthorizationContext: async () => createTestAuthorizationContext(),
      }),
    ).rejects.toMatchObject({
      response: { code: readOnlyModeErrorCodes.forbidden },
    });
  });

  it('does not treat a shadow ALLOW as a mutation grant', async () => {
    const harness = createTestAuthorizationHarness();
    harness.loadBySubjectId.mockResolvedValue(createTestAuthorizationContext());
    const shadow = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.ticketMerge],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(shadow.decision).toBe('ALLOW');
    expect(shadow.isEnforcing).toBe(false);
    await expect(
      enforceAdminReadOnlyMode({
        route: {
          moduleKey: adminReadOnlyModuleKeys.settings,
          isMutation: true,
        },
        principal: shadowTestPrincipal,
        loadConfiguration: async () => lockedConfiguration,
        loadAuthorizationContext: async () => createTestAuthorizationContext(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
