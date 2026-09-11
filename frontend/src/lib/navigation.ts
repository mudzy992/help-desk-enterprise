export const navigationLabelKeys = {
  dashboard: "navigation.dashboard",
  tickets: "navigation.tickets",
  services: "navigation.services",
  knowledgeBase: "navigation.knowledgeBase",
  users: "navigation.users",
  organizationalUnits: "navigation.organizationalUnits",
  routing: "navigation.routing",
  settings: "navigation.settings",
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
}

export interface NavigationSection {
  readonly labelKey: NavigationSectionKey;
  readonly items: readonly NavigationItem[];
}

export const dashboardNavigationItem: NavigationItem = {
  path: "/",
  labelKey: navigationLabelKeys.dashboard,
  end: true,
};

export const ticketsNavigationItem: NavigationItem = {
  path: "/tickets",
  labelKey: navigationLabelKeys.tickets,
  end: false,
};

export const servicesNavigationItem: NavigationItem = {
  path: "/services",
  labelKey: navigationLabelKeys.services,
  end: false,
};

export const knowledgeBaseNavigationItem: NavigationItem = {
  path: "/knowledge-base",
  labelKey: navigationLabelKeys.knowledgeBase,
  end: false,
};

export const usersNavigationItem: NavigationItem = {
  path: "/users",
  labelKey: navigationLabelKeys.users,
  end: false,
};

export const organizationalUnitsNavigationItem: NavigationItem = {
  path: "/organizational-units",
  labelKey: navigationLabelKeys.organizationalUnits,
  end: false,
};

export const routingNavigationItem: NavigationItem = {
  path: "/routing",
  labelKey: navigationLabelKeys.routing,
  end: false,
};

export const settingsNavigationItem: NavigationItem = {
  path: "/settings",
  labelKey: navigationLabelKeys.settings,
  end: false,
};

export const navigationSections: readonly NavigationSection[] = [
  {
    labelKey: navigationSectionKeys.overview,
    items: [dashboardNavigationItem],
  },
  {
    labelKey: navigationSectionKeys.tickets,
    items: [ticketsNavigationItem],
  },
  {
    labelKey: navigationSectionKeys.services,
    items: [servicesNavigationItem, knowledgeBaseNavigationItem],
  },
  {
    labelKey: navigationSectionKeys.administration,
    items: [
      usersNavigationItem,
      organizationalUnitsNavigationItem,
      routingNavigationItem,
      settingsNavigationItem,
    ],
  },
];

export const primaryNavigationItems: readonly NavigationItem[] =
  navigationSections.flatMap((section) => section.items);

export const allNavigationItems: readonly NavigationItem[] = primaryNavigationItems;

export function getActiveNavigationItem(pathname: string): NavigationItem {
  const matchedItem = allNavigationItems.find((item) => {
    if (item.end) {
      return pathname === item.path;
    }
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  });
  return matchedItem ?? dashboardNavigationItem;
}
