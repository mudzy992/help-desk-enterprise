import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Bookmark,
  ClipboardCheck,
  GitPullRequestArrow,
  ListChecks,
  Lock,
  Mail,
  Puzzle,
  Server,
  Smile,
  SplitSquareVertical,
  Users,
} from "lucide-react";

/*
  The add-on step previously showed the catalog's technical
  descriptions („CSAT addon flag from the install wizard catalog"). This map is the
  operator's version of the same list: an icon, a name and one sentence about what
  the add-on brings, grouped by what it is good for. The catalog stays as it is —
  Settings keeps the technical wording.
*/

export type InstallAddonCategoryKey =
  "serviceQuality" | "control" | "productivity" | "itsm" | "integrations";

/** Order of the sections on the add-ons step. */
export const installAddonCategoryOrder: readonly InstallAddonCategoryKey[] = [
  "serviceQuality",
  "control",
  "productivity",
  "itsm",
  "integrations",
];

export const installAddonCategoryKeys = {
  serviceQuality: "install.addons.category.serviceQuality",
  control: "install.addons.category.control",
  productivity: "install.addons.category.productivity",
  itsm: "install.addons.category.itsm",
  integrations: "install.addons.category.integrations",
} as const;

export function installAddonCategoryKey(
  category: InstallAddonCategoryKey,
): (typeof installAddonCategoryKeys)[InstallAddonCategoryKey] {
  return installAddonCategoryKeys[category];
}

/**
 * `as const` on purpose: the titles and sentences are i18n keys, and the typed
 * `t()` only accepts keys that exist — a literal type here turns a typo into a
 * compile error instead of a raw key on the screen.
 */
export const installAddonPresentations = {
  csat: {
    icon: Smile,
    category: "serviceQuality",
    titleKey: "install.addons.csat.title",
    valueKey: "install.addons.csat.value",
  },
  reports: {
    icon: BarChart3,
    category: "serviceQuality",
    titleKey: "install.addons.reports.title",
    valueKey: "install.addons.reports.value",
  },
  approvals: {
    icon: ClipboardCheck,
    category: "control",
    titleKey: "install.addons.approvals.title",
    valueKey: "install.addons.approvals.value",
  },
  confidential: {
    icon: Lock,
    category: "control",
    titleKey: "install.addons.confidential.title",
    valueKey: "install.addons.confidential.value",
  },
  savedViews: {
    icon: Bookmark,
    category: "productivity",
    titleKey: "install.addons.savedViews.title",
    valueKey: "install.addons.savedViews.value",
  },
  bulkActions: {
    icon: ListChecks,
    category: "productivity",
    titleKey: "install.addons.bulkActions.title",
    valueKey: "install.addons.bulkActions.value",
  },
  ticketSplit: {
    icon: SplitSquareVertical,
    category: "productivity",
    titleKey: "install.addons.ticketSplit.title",
    valueKey: "install.addons.ticketSplit.value",
  },
  kbIntercept: {
    icon: BookOpenCheck,
    category: "productivity",
    titleKey: "install.addons.kbIntercept.title",
    valueKey: "install.addons.kbIntercept.value",
  },
  cmdb: {
    icon: Server,
    category: "itsm",
    titleKey: "install.addons.cmdb.title",
    valueKey: "install.addons.cmdb.value",
  },
  problems: {
    icon: AlertTriangle,
    category: "itsm",
    titleKey: "install.addons.problems.title",
    valueKey: "install.addons.problems.value",
  },
  changes: {
    icon: GitPullRequestArrow,
    category: "itsm",
    titleKey: "install.addons.changes.title",
    valueKey: "install.addons.changes.value",
  },
  email: {
    icon: Mail,
    category: "integrations",
    titleKey: "install.addons.email.title",
    valueKey: "install.addons.email.value",
  },
  edge: {
    icon: Puzzle,
    category: "integrations",
    titleKey: "install.addons.edge.title",
    valueKey: "install.addons.edge.value",
  },
  teams: {
    icon: Users,
    category: "integrations",
    titleKey: "install.addons.teams.title",
    valueKey: "install.addons.teams.value",
  },
} as const;

export type InstallAddonPresentation =
  (typeof installAddonPresentations)[keyof typeof installAddonPresentations];

export function resolveInstallAddonPresentation(key: string): InstallAddonPresentation | null {
  if (key in installAddonPresentations) {
    return installAddonPresentations[key as keyof typeof installAddonPresentations];
  }
  return null;
}
