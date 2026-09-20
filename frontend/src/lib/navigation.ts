import {
  navigationAccessKinds,
  type NavigationAccessRequirement,
} from "@/lib/session/route-access";

export const navigationLabelKeys = {
  dashboard: "navigation.dashboard",
  reports: "navigation.reports",
  tickets: "navigation.tickets",
  inbox: "navigation.inbox",
  services: "navigation.services",
  knowledgeBase: "navigation.knowledgeBase",
  routing: "navigation.routing",
  sla: "navigation.sla",
  admin: "navigation.admin",
  queue: "navigation.queue",
  configVersions: "navigation.configVersions",
} as const;

export type NavigationLabelKey =
  (typeof navigationLabelKeys)[keyof typeof navigationLabelKeys];

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
};

export const inboxNavigationItem: NavigationItem = {
  path: "/tickets?view=inbox",
  labelKey: navigationLabelKeys.inbox,
  end: true,
  access: { kind: navigationAccessKinds.staff },
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

export const queueNavigationItem: NavigationItem = {
  path: "/admin/queue",
  labelKey: navigationLabelKeys.queue,
  end: false,
  access: { kind: navigationAccessKinds.integrationQueue },
};

export const configVersionsNavigationItem: NavigationItem = {
  path: "/admin/config-versions",
  labelKey: navigationLabelKeys.configVersions,
  end: false,
  access: { kind: navigationAccessKinds.configVersions },
};

export const navigationSections: readonly NavigationSection[] = [
  {
    labelKey: navigationSectionKeys.overview,
    items: [dashboardNavigationItem, reportsNavigationItem],
  },
  {
    labelKey: navigationSectionKeys.tickets,
    items: [ticketsNavigationItem, inboxNavigationItem],
  },
  {
    labelKey: navigationSectionKeys.services,
    items: [servicesNavigationItem, knowledgeBaseNavigationItem],
  },
  {
    labelKey: navigationSectionKeys.administration,
    items: [
      routingNavigationItem,
      slaNavigationItem,
      adminNavigationItem,
      queueNavigationItem,
      configVersionsNavigationItem,
    ],
  },
];

export const primaryNavigationItems: readonly NavigationItem[] =
  navigationSections.flatMap((section) => section.items);

export const allNavigationItems: readonly NavigationItem[] = primaryNavigationItems;

function navigationItemPathname(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function ticketListView(search: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("view");
}

export function isNavigationItemActive(
  item: NavigationItem,
  pathname: string,
  search = "",
): boolean {
  if (item.labelKey === navigationLabelKeys.inbox) {
    if (pathname !== "/tickets") {
      return false;
    }
    const view = ticketListView(search);
    return view === "inbox" || view === null;
  }

  if (item.labelKey === navigationLabelKeys.tickets) {
    if (pathname === "/tickets/new") {
      return false;
    }
    if (pathname === "/tickets") {
      const view = ticketListView(search);
      return view !== null && view !== "inbox";
    }
    return pathname.startsWith("/tickets/");
  }

  const itemPathname = navigationItemPathname(item.path);
  if (item.end) {
    return pathname === itemPathname;
  }
  return pathname === itemPathname || pathname.startsWith(`${itemPathname}/`);
}

export function getActiveNavigationItem(
  pathname: string,
  search = "",
): NavigationItem {
  const matchedItem = allNavigationItems.find((item) =>
    isNavigationItemActive(item, pathname, search),
  );
  return matchedItem ?? dashboardNavigationItem;
}
