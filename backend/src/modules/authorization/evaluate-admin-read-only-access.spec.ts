import { authorizationRoleKeys } from './authorization.constants';
import { createTestAuthorizationContext } from './create-test-authorization-context';
import { evaluateAdminReadOnlyAccess } from './evaluate-admin-read-only-access';
import {
  adminReadOnlyModuleKeys,
  defaultAdminReadOnlyLockableModulesCsv,
} from './read-only-mode.constants';
import { parseCsvTokens } from './parse-csv-tokens';
import {
  adminReadOnlyDecisionReasons,
  type AdminReadOnlyRoute,
  type ReadOnlyModeConfiguration,
} from './read-only-mode.types';

function createConfiguration(
  overrides: Partial<ReadOnlyModeConfiguration> = {},
): ReadOnlyModeConfiguration {
  return {
    enabled: true,
    lockableModuleKeys: parseCsvTokens(defaultAdminReadOnlyLockableModulesCsv),
    activeModuleKeys: [adminReadOnlyModuleKeys.admin],
    bypassRoleKeys: [authorizationRoleKeys.superAdmin],
    ...overrides,
  };
}

const applyPolicyRoute: AdminReadOnlyRoute = {
  moduleKey: adminReadOnlyModuleKeys.settings,
  isMutation: true,
};

const createOrganizationalUnitRoute: AdminReadOnlyRoute = {
  moduleKey: adminReadOnlyModuleKeys.admin,
  isMutation: true,
};

describe('evaluateAdminReadOnlyAccess', () => {
  it('allows mutations when the mode is disabled', () => {
    const decision = evaluateAdminReadOnlyAccess({
      configuration: createConfiguration({ enabled: false }),
      route: createOrganizationalUnitRoute,
      authorizationContext: createTestAuthorizationContext(),
    });
    expect(decision).toEqual({
      allowed: true,
      reason: adminReadOnlyDecisionReasons.modeDisabled,
    });
  });

  it('allows mutations when enabled but no module is active', () => {
    const decision = evaluateAdminReadOnlyAccess({
      configuration: createConfiguration({ activeModuleKeys: [] }),
      route: applyPolicyRoute,
      authorizationContext: createTestAuthorizationContext(),
    });
    expect(decision).toEqual({
      allowed: true,
      reason: adminReadOnlyDecisionReasons.moduleNotActive,
    });
  });

  it('blocks admin mutations when enabled and admin is active', () => {
    const decision = evaluateAdminReadOnlyAccess({
      configuration: createConfiguration(),
      route: applyPolicyRoute,
      authorizationContext: createTestAuthorizationContext(),
    });
    expect(decision).toEqual({
      allowed: false,
      reason: adminReadOnlyDecisionReasons.readOnlyMode,
    });
  });

  it('keeps admin reads available while mutations are locked', () => {
    const decision = evaluateAdminReadOnlyAccess({
      configuration: createConfiguration(),
      route: { moduleKey: adminReadOnlyModuleKeys.admin, isMutation: false },
      authorizationContext: createTestAuthorizationContext(),
    });
    expect(decision).toEqual({
      allowed: true,
      reason: adminReadOnlyDecisionReasons.readOperation,
    });
  });

  it('lets a local SuperAdmin bypass a locked module', () => {
    const decision = evaluateAdminReadOnlyAccess({
      configuration: createConfiguration(),
      route: createOrganizationalUnitRoute,
      authorizationContext: createTestAuthorizationContext({
        isLocalOnly: true,
        isSuperAdmin: true,
        assignments: [
          {
            roleKey: authorizationRoleKeys.superAdmin,
            permissionKeys: [],
            organizationalUnitId: null,
            organizationalUnitPath: null,
            serviceId: null,
          },
        ],
      }),
    });
    expect(decision.reason).toBe(adminReadOnlyDecisionReasons.bypassRole);
    expect(decision.allowed).toBe(true);
  });

  it('does not bypass when SuperAdmin is not local-only', () => {
    const decision = evaluateAdminReadOnlyAccess({
      configuration: createConfiguration(),
      route: createOrganizationalUnitRoute,
      authorizationContext: createTestAuthorizationContext({
        isLocalOnly: false,
        isSuperAdmin: true,
      }),
    });
    expect(decision).toEqual({
      allowed: false,
      reason: adminReadOnlyDecisionReasons.readOnlyMode,
    });
  });
});
