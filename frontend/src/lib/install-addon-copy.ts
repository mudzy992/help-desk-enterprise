export const installAddonCopyKeys = {
  sla: {
    label: "install.addons.catalog.sla.label",
    description: "install.addons.catalog.sla.description",
  },
  email: {
    label: "install.addons.catalog.email.label",
    description: "install.addons.catalog.email.description",
  },
  edge: {
    label: "install.addons.catalog.edge.label",
    description: "install.addons.catalog.edge.description",
  },
  teamsStub: {
    label: "install.addons.catalog.teamsStub.label",
    description: "install.addons.catalog.teamsStub.description",
  },
  csat: {
    label: "install.addons.catalog.csat.label",
    description: "install.addons.catalog.csat.description",
  },
  autoAssign: {
    label: "install.addons.catalog.autoAssign.label",
    description: "install.addons.catalog.autoAssign.description",
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
  timeTracking: {
    label: "install.addons.catalog.timeTracking.label",
    description: "install.addons.catalog.timeTracking.description",
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
  serviceDowntime: {
    label: "install.addons.catalog.serviceDowntime.label",
    description: "install.addons.catalog.serviceDowntime.description",
  },
} as const;

export type InstallAddonCopyKey = keyof typeof installAddonCopyKeys;

export function resolveInstallAddonCopy(key: string) {
  if (key in installAddonCopyKeys) {
    return installAddonCopyKeys[key as InstallAddonCopyKey];
  }
  return null;
}
