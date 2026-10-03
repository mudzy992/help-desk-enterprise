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
  privacy: "privacy",
  onCall: "onCall",
  assets: "assets",
  myAssets: "myAssets",
  problems: "problems",
  changes: "changes",
  docs: "docs",
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

/**
 * Paket 2.6 (§11): the privacy area needs `privacy.view` (ADMIN, SUPER_ADMIN
 * and a DPO role that holds it); the tabs inside follow manage/anonymize.
 */
export function canOpenPrivacy(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  return session.isSuperAdmin || capabilities.hasPermission(permissionKeys.privacyView);
}

/** Paket 2.9 (K3): the on-call calendar needs `oncall.read` (AGENT, ADMIN, SUPER_ADMIN). */
export function canOpenOnCall(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  return session.isSuperAdmin || capabilities.hasPermission(permissionKeys.onCallRead);
}

/** Paket 3.2 (§17): the CMDB module is on and the viewer holds `asset.read`. */
export function canOpenAssets(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null || session.modules?.cmdb !== true) {
    return false;
  }
  return session.isSuperAdmin || capabilities.hasPermission(permissionKeys.assetRead);
}

/** Paket 3.2 (§17): "My equipment" for every signed-in user while the module is on. */
export function canOpenMyAssets(capabilities: SessionCapabilities): boolean {
  return capabilities.session?.modules?.cmdb === true;
}

/** Paket 3.3 (§14): the problem module is on and the viewer holds `problem.read`. */
export function canOpenProblems(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null || session.modules?.problems !== true) {
    return false;
  }
  return session.isSuperAdmin || capabilities.hasPermission(permissionKeys.problemRead);
}

/** Paket 3.4 (§15, §17): the change module is on and the viewer holds `change.read`. */
export function canOpenChanges(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null || session.modules?.changes !== true) {
    return false;
  }
  return session.isSuperAdmin || capabilities.hasPermission(permissionKeys.changeRead);
}

/** Faza 3 (c): Dokumentacija je dostupna svakom prijavljenom korisniku. */
export function canOpenDocs(capabilities: SessionCapabilities): boolean {
  return capabilities.session !== null;
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

/** Paket 3.1 (§16): Administration → Microsoft Teams. */
export function canOpenTeamsAdminPage(capabilities: SessionCapabilities): boolean {
  const session = capabilities.session;
  if (session === null) {
    return false;
  }
  return session.isSuperAdmin || capabilities.hasPermission(permissionKeys.integrationsTeamsManage);
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
    case navigationAccessKinds.privacy:
      return canOpenPrivacy(capabilities);
    case navigationAccessKinds.onCall:
      return canOpenOnCall(capabilities);
    case navigationAccessKinds.assets:
      return canOpenAssets(capabilities);
    case navigationAccessKinds.myAssets:
      return canOpenMyAssets(capabilities);
    case navigationAccessKinds.problems:
      return canOpenProblems(capabilities);
    case navigationAccessKinds.changes:
      return canOpenChanges(capabilities);
    case navigationAccessKinds.docs:
      return canOpenDocs(capabilities);
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
