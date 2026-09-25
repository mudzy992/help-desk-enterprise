import { canOpenConfigVersions } from "@/lib/config-versions/can-access-config-versions";
import type { NavigationItem, NavigationSection } from "@/lib/navigation";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";

export const navigationAccessKinds = {
  authenticated: "authenticated",
  admin: "admin",
  staff: "staff",
  reports: "reports",
  configVersions: "configVersions",
} as const;

export type NavigationAccessKind =
  (typeof navigationAccessKinds)[keyof typeof navigationAccessKinds];

export interface NavigationAccessRequirement {
  readonly kind: NavigationAccessKind;
}

export function canOpenAdminArea(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  return (
    session.isSuperAdmin === true ||
    capabilities.hasRole(roleKeys.admin) ||
    capabilities.hasRole(roleKeys.superAdmin)
  );
}

/**
 * Ticket staff: SuperAdmin, AGENT or ADMIN. Requesters (USER) never work the
 * group inbox, so screens built for handling tickets are hidden from them.
 */
export function isTicketStaff(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  return (
    session.isSuperAdmin === true ||
    capabilities.hasRole(roleKeys.agent) ||
    capabilities.hasRole(roleKeys.admin) ||
    capabilities.hasRole(roleKeys.superAdmin)
  );
}

export function canOpenReports(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  if (session.isSuperAdmin) {
    return true;
  }
  if (!canOpenAdminArea(capabilities)) {
    return false;
  }
  return (
    capabilities.hasPermission(permissionKeys.reportsExport) ||
    capabilities.hasPermission(permissionKeys.auditExport)
  );
}

export function canOpenRouting(capabilities: SessionCapabilities): boolean {
  return canOpenAdminArea(capabilities);
}

export function canOpenSla(capabilities: SessionCapabilities): boolean {
  return canOpenAdminArea(capabilities);
}

export function canOpenConfigVersionsPage(
  capabilities: SessionCapabilities,
): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  return canOpenConfigVersions({
    isSuperAdmin: session.isSuperAdmin,
    roleKeys: session.roleKeys,
  });
}

/** Paket 1.5: same audience as the settings page (ADMIN / SUPER_ADMIN). */
export function canOpenEmailTemplatesPage(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  return (
    session.isSuperAdmin ||
    capabilities.hasRole(roleKeys.admin) ||
    capabilities.hasRole(roleKeys.superAdmin)
  );
}

/** Paket 1.4 (A1): any staff member (tabs inside follow the permissions). */
export function canOpenTemplatesPage(capabilities: SessionCapabilities): boolean {
  return isTicketStaff(capabilities);
}

export function canAccessNavigationItem(
  item: NavigationItem,
  capabilities: SessionCapabilities,
): boolean {
  if (capabilities.session === null) {
    return false;
  }
  switch (item.access.kind) {
    case navigationAccessKinds.authenticated:
      return true;
    case navigationAccessKinds.admin:
      return canOpenAdminArea(capabilities);
    case navigationAccessKinds.staff:
      return isTicketStaff(capabilities);
    case navigationAccessKinds.reports:
      return canOpenReports(capabilities);
    case navigationAccessKinds.configVersions:
      return canOpenConfigVersionsPage(capabilities);
    default:
      return false;
  }
}

export function filterNavigationSections(
  sections: readonly NavigationSection[],
  capabilities: SessionCapabilities,
): readonly NavigationSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        canAccessNavigationItem(item, capabilities),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
