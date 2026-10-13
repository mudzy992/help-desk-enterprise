import {
  navigationAccessKinds,
  type NavigationAccessRequirement,
} from "@/lib/session/route-access";

export const navigationLabelKeys = {
  dashboard: "navigation.dashboard",
  reports: "navigation.reports",
  tickets: "navigation.tickets",
  services: "navigation.services",
  knowledgeBase: "navigation.knowledgeBase",
  routing: "navigation.routing",
  sla: "navigation.sla",
  admin: "navigation.admin",
  configVersions: "navigation.configVersions",
  workflow: "navigation.workflow",
  templates: "navigation.templates",
  privacy: "navigation.privacy",
  status: "navigation.status",
  onCall: "navigation.onCall",
  announcements: "navigation.announcements",
  assets: "navigation.assets",
  myAssets: "navigation.myAssets",
  problems: "navigation.problems",
  changes: "navigation.changes",
  docs: "navigation.docs",
} as const;

export type NavigationLabelKey = (typeof navigationLabelKeys)[keyof typeof navigationLabelKeys];

export const navigationSectionKeys = {
  overview: "navigation.sections.overview",
  tickets: "navigation.sections.tickets",
  services: "navigation.sections.services",
  administration: "navigation.sections.administration",
} as const;

export type NavigationSectionKey =
  (typeof navigationSectionKeys)[keyof typeof navigationSectionKeys];

export interface NavigationItem {
  readonly path: string;
  readonly labelKey: NavigationLabelKey;
  readonly end: boolean;
  readonly access: NavigationAccessRequirement;
  /**
   * Paths that light this item. Defaults to the item's own path. Used when one
   * destination owns several screens, such as "All tickets" owning `/tickets/*`.
   */
  readonly matchPrefixes?: readonly string[];
  /** Exact paths that never light this item, even when a prefix matches. */
  readonly excludePaths?: readonly string[];
}

export interface NavigationSection {
  readonly labelKey: NavigationSectionKey;
  readonly items: readonly NavigationItem[];
}

export const dashboardNavigationItem: NavigationItem = {
  path: "/",
  labelKey: navigationLabelKeys.dashboard,
  end: true,
  access: { kind: navigationAccessKinds.authenticated },
};

export const reportsNavigationItem: NavigationItem = {
  path: "/reports",
  labelKey: navigationLabelKeys.reports,
  end: true,
  access: { kind: navigationAccessKinds.reports },
};

export const ticketsNavigationItem: NavigationItem = {
  path: "/tickets?view=all",
  labelKey: navigationLabelKeys.tickets,
  end: false,
  access: { kind: navigationAccessKinds.authenticated },
  matchPrefixes: ["/tickets"],
  excludePaths: ["/tickets/new"],
};

export const servicesNavigationItem: NavigationItem = {
  path: "/services",
  labelKey: navigationLabelKeys.services,
  end: false,
  access: { kind: navigationAccessKinds.authenticated },
};

export const knowledgeBaseNavigationItem: NavigationItem = {
  path: "/knowledge-base",
  labelKey: navigationLabelKeys.knowledgeBase,
  end: false,
  access: { kind: navigationAccessKinds.authenticated },
};

export const adminNavigationItem: NavigationItem = {
  path: "/admin",
  labelKey: navigationLabelKeys.admin,
  end: true,
  access: { kind: navigationAccessKinds.admin },
};

export const routingNavigationItem: NavigationItem = {
  path: "/routing",
  labelKey: navigationLabelKeys.routing,
  end: false,
  access: { kind: navigationAccessKinds.admin },
};

export const slaNavigationItem: NavigationItem = {
  path: "/sla",
  labelKey: navigationLabelKeys.sla,
  end: false,
  access: { kind: navigationAccessKinds.admin },
};

export const configVersionsNavigationItem: NavigationItem = {
  path: "/admin/config-versions",
  labelKey: navigationLabelKeys.configVersions,
  end: false,
  access: { kind: navigationAccessKinds.configVersions },
};

/** Read-only status flow, ADMIN/SUPER_ADMIN. */
export const workflowNavigationItem: NavigationItem = {
  path: "/admin/workflow",
  labelKey: navigationLabelKeys.workflow,
  end: false,
  access: { kind: navigationAccessKinds.admin },
};

/** Templates & playbooks — agents see their personal tab. */
export const templatesNavigationItem: NavigationItem = {
  path: "/admin/templates",
  labelKey: navigationLabelKeys.templates,
  end: false,
  access: { kind: navigationAccessKinds.staff },
};

/** Data subject requests, erasure, exports, retention, holds, record. */
export const privacyNavigationItem: NavigationItem = {
  path: "/privacy",
  labelKey: navigationLabelKeys.privacy,
  end: false,
  access: { kind: navigationAccessKinds.privacy },
};

/** Dokumentacija u aplikaciji — svaki prijavljeni korisnik. */
export const docsNavigationItem: NavigationItem = {
  path: "/docs",
  labelKey: navigationLabelKeys.docs,
  end: false,
  access: { kind: navigationAccessKinds.docs },
};

/** Service status and incidents, every signed-in user. */
export const statusNavigationItem: NavigationItem = {
  path: "/status",
  labelKey: navigationLabelKeys.status,
  end: false,
  access: { kind: navigationAccessKinds.authenticated },
};

/** Announcement archive for everyone; managing is gated server-side. */
export const announcementsNavigationItem: NavigationItem = {
  path: "/announcements",
  labelKey: navigationLabelKeys.announcements,
  end: false,
  access: { kind: navigationAccessKinds.authenticated },
};

/** On-call calendar, holders of oncall.read. */
export const onCallNavigationItem: NavigationItem = {
  path: "/on-call",
  labelKey: navigationLabelKeys.onCall,
  end: false,
  access: { kind: navigationAccessKinds.onCall },
};

/** Asset register (module on + asset.read). */
export const assetsNavigationItem: NavigationItem = {
  path: "/assets",
  labelKey: navigationLabelKeys.assets,
  end: false,
  access: { kind: navigationAccessKinds.assets },
};

/** The user's own equipment (module on). */
export const myAssetsNavigationItem: NavigationItem = {
  path: "/my-assets",
  labelKey: navigationLabelKeys.myAssets,
  end: false,
  access: { kind: navigationAccessKinds.myAssets },
};

/** Problem register (module on + problem.read). */
export const problemsNavigationItem: NavigationItem = {
  path: "/problems",
  labelKey: navigationLabelKeys.problems,
  end: false,
  access: { kind: navigationAccessKinds.problems },
};

/** Change register (module on + change.read). */
export const changesNavigationItem: NavigationItem = {
  path: "/changes",
  labelKey: navigationLabelKeys.changes,
  end: false,
  access: { kind: navigationAccessKinds.changes },
};

export const navigationSections: readonly NavigationSection[] = [
  {
    labelKey: navigationSectionKeys.overview,
    items: [dashboardNavigationItem, reportsNavigationItem, docsNavigationItem],
  },
  {
    labelKey: navigationSectionKeys.tickets,
    items: [
      ticketsNavigationItem,
      problemsNavigationItem,
      changesNavigationItem,
      templatesNavigationItem,
      onCallNavigationItem,
    ],
  },
  {
    labelKey: navigationSectionKeys.services,
    items: [
      servicesNavigationItem,
      statusNavigationItem,
      announcementsNavigationItem,
      knowledgeBaseNavigationItem,
      myAssetsNavigationItem,
      assetsNavigationItem,
    ],
  },
  {
    labelKey: navigationSectionKeys.administration,
    items: [
      routingNavigationItem,
      slaNavigationItem,
      workflowNavigationItem,
      adminNavigationItem,
      privacyNavigationItem,
      configVersionsNavigationItem,
    ],
  },
];

export const primaryNavigationItems: readonly NavigationItem[] = navigationSections.flatMap(
  (section) => section.items,
);

function navigationItemPathname(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

export function isNavigationItemActive(item: NavigationItem, pathname: string): boolean {
  if (item.excludePaths?.includes(pathname)) {
    return false;
  }
  const prefixes = item.matchPrefixes ?? [navigationItemPathname(item.path)];
  return prefixes.some((prefix) => {
    if (pathname === prefix) {
      return true;
    }
    return !item.end && pathname.startsWith(`${prefix}/`);
  });
}

export function getActiveNavigationItem(pathname: string): NavigationItem {
  const matchedItem = primaryNavigationItems.find((item) => isNavigationItemActive(item, pathname));
  return matchedItem ?? dashboardNavigationItem;
}
