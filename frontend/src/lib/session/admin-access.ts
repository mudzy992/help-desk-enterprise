import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";

export function canWriteSettings(capabilities: SessionCapabilities): boolean {
  return (
    capabilities.session?.isSuperAdmin === true ||
    capabilities.hasPermission(permissionKeys.settingsWrite)
  );
}

export type AdminOpsVisibility = {
  readonly health: boolean;
  readonly manageAlerts: boolean;
  readonly auditExport: boolean;
  readonly supportBundle: boolean;
  readonly securityMetrics: boolean;
  readonly integrationQueue: boolean;
  readonly teams: boolean;
};

export function adminOpsVisibility(capabilities: SessionCapabilities): AdminOpsVisibility {
  const superAdmin = capabilities.session?.isSuperAdmin === true;
  return {
    health: superAdmin || capabilities.hasPermission(permissionKeys.opsHealthView),
    manageAlerts: superAdmin || capabilities.hasPermission(permissionKeys.opsAlertsManage),
    auditExport: superAdmin || capabilities.hasPermission(permissionKeys.auditExport),
    supportBundle: superAdmin || capabilities.hasRole(roleKeys.superAdmin),
    // Security metrics intentionally follow the support-bundle boundary: both
    // expose installation-wide security information rather than OU-scoped data.
    securityMetrics: superAdmin || capabilities.hasRole(roleKeys.superAdmin),
    integrationQueue:
      superAdmin || capabilities.hasPermission(permissionKeys.integrationsQueueManage),
    teams: superAdmin || capabilities.hasPermission(permissionKeys.integrationsTeamsManage),
  };
}
