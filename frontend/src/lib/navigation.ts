export const navigationLabelKeys = {
  dashboard: "navigation.dashboard",
  tickets: "navigation.tickets",
  knowledgeBase: "navigation.knowledgeBase",
  users: "navigation.users",
  organizationalUnits: "navigation.organizationalUnits",
  routing: "navigation.routing",
  settings: "navigation.settings",
} as const;

export type NavigationLabelKey =
  (typeof navigationLabelKeys)[keyof typeof navigationLabelKeys];

export interface NavigationItem {
  readonly path: string;
  readonly labelKey: NavigationLabelKey;
  readonly end: boolean;
}

export const primaryNavigationItems: readonly NavigationItem[] = [
  { path: "/", labelKey: navigationLabelKeys.dashboard, end: true },
  { path: "/tickets", labelKey: navigationLabelKeys.tickets, end: false },
  {
    path: "/knowledge-base",
    labelKey: navigationLabelKeys.knowledgeBase,
    end: false,
  },
  { path: "/users", labelKey: navigationLabelKeys.users, end: false },
  {
    path: "/organizational-units",
    labelKey: navigationLabelKeys.organizationalUnits,
    end: false,
  },
  { path: "/routing", labelKey: navigationLabelKeys.routing, end: false },
];

export const settingsNavigationItem: NavigationItem = {
  path: "/settings",
  labelKey: navigationLabelKeys.settings,
  end: false,
};

export const allNavigationItems: readonly NavigationItem[] = [
  ...primaryNavigationItems,
  settingsNavigationItem,
];

export function getActiveNavigationItem(pathname: string): NavigationItem {
  const matchedItem = allNavigationItems.find((item) => {
    if (item.end) {
      return pathname === item.path;
    }
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  });
  return matchedItem ?? primaryNavigationItems[0];
}
