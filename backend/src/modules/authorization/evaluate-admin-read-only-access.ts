import { authorizationRoleKeys } from './authorization.constants';
import type { AuthorizationContext } from './authorization.types';
import { adminReadOnlyModuleKeys } from './read-only-mode.constants';
import {
  adminReadOnlyDecisionReasons,
  type AdminReadOnlyDecision,
  type AdminReadOnlyRoute,
  type ReadOnlyModeConfiguration,
} from './read-only-mode.types';

export function evaluateAdminReadOnlyAccess(input: {
  readonly configuration: ReadOnlyModeConfiguration;
  readonly route: AdminReadOnlyRoute | null;
  readonly authorizationContext: AuthorizationContext | null;
}): AdminReadOnlyDecision {
  if (input.route === null) {
    return allow(adminReadOnlyDecisionReasons.notAdminRoute);
  }
  if (!input.route.isMutation) {
    return allow(adminReadOnlyDecisionReasons.readOperation);
  }
  if (!input.configuration.enabled) {
    return allow(adminReadOnlyDecisionReasons.modeDisabled);
  }
  if (!isModuleLocked(input.route.moduleKey, input.configuration)) {
    return allow(adminReadOnlyDecisionReasons.moduleNotActive);
  }
  if (canBypassReadOnlyMode(input.authorizationContext, input.configuration)) {
    return allow(adminReadOnlyDecisionReasons.bypassRole);
  }
  return {
    allowed: false,
    reason: adminReadOnlyDecisionReasons.readOnlyMode,
  };
}

function allow(reason: AdminReadOnlyDecision['reason']): AdminReadOnlyDecision {
  return { allowed: true, reason };
}

function isModuleLocked(
  moduleKey: string,
  configuration: ReadOnlyModeConfiguration,
): boolean {
  const lockable = new Set(configuration.lockableModuleKeys);
  const active = configuration.activeModuleKeys.filter((key) =>
    lockable.has(key),
  );
  if (active.includes(adminReadOnlyModuleKeys.admin)) {
    return true;
  }
  return active.includes(moduleKey);
}

function canBypassReadOnlyMode(
  context: AuthorizationContext | null,
  configuration: ReadOnlyModeConfiguration,
): boolean {
  if (context === null || configuration.bypassRoleKeys.length === 0) {
    return false;
  }
  const bypassRoleKeys = new Set(configuration.bypassRoleKeys);
  if (
    bypassRoleKeys.has(authorizationRoleKeys.superAdmin) &&
    context.isSuperAdmin &&
    context.isLocalOnly
  ) {
    return true;
  }
  return context.assignments.some(
    (assignment) =>
      assignment.roleKey !== authorizationRoleKeys.superAdmin &&
      bypassRoleKeys.has(assignment.roleKey),
  );
}
