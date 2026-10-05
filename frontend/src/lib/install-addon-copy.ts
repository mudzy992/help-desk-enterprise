export const installAddonCopyKeys = {
  email: {
    label: "install.addons.catalog.email.label",
    description: "install.addons.catalog.email.description",
  },
  edge: {
    label: "install.addons.catalog.edge.label",
    description: "install.addons.catalog.edge.description",
  },
  csat: {
    label: "install.addons.catalog.csat.label",
    description: "install.addons.catalog.csat.description",
  },
  approvals: {
    label: "install.addons.catalog.approvals.label",
    description: "install.addons.catalog.approvals.description",
  },
  confidential: {
    label: "install.addons.catalog.confidential.label",
    description: "install.addons.catalog.confidential.description",
  },
  kbIntercept: {
    label: "install.addons.catalog.kbIntercept.label",
    description: "install.addons.catalog.kbIntercept.description",
  },
  ticketSplit: {
    label: "install.addons.catalog.ticketSplit.label",
    description: "install.addons.catalog.ticketSplit.description",
  },
  bulkActions: {
    label: "install.addons.catalog.bulkActions.label",
    description: "install.addons.catalog.bulkActions.description",
  },
  savedViews: {
    label: "install.addons.catalog.savedViews.label",
    description: "install.addons.catalog.savedViews.description",
  },
  reports: {
    label: "install.addons.catalog.reports.label",
    description: "install.addons.catalog.reports.description",
  },
  cmdb: {
    label: "install.addons.catalog.cmdb.label",
    description: "install.addons.catalog.cmdb.description",
  },
  problems: {
    label: "install.addons.catalog.problems.label",
    description: "install.addons.catalog.problems.description",
  },
  changes: {
    label: "install.addons.catalog.changes.label",
    description: "install.addons.catalog.changes.description",
  },
  teams: {
    label: "install.addons.catalog.teams.label",
    description: "install.addons.catalog.teams.description",
  },
} as const;

export type InstallAddonCopyKey = keyof typeof installAddonCopyKeys;

export function resolveInstallAddonCopy(key: string) {
  if (key in installAddonCopyKeys) {
    return installAddonCopyKeys[key as InstallAddonCopyKey];
  }
  return null;
}
