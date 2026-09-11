export const installAddonCatalog = [
  {
    key: 'sla',
    defaultEnabled: true,
    description: 'SLA addon flag from the install wizard catalog',
  },
  {
    key: 'email',
    defaultEnabled: false,
    requiresSmtp: true,
    description:
      'Email addon flag from the install wizard catalog; SMTP off always wins',
  },
  {
    key: 'edge',
    defaultEnabled: false,
    description: 'Edge addon flag from the install wizard catalog',
  },
  {
    key: 'teamsStub',
    defaultEnabled: false,
    description: 'Teams stub addon flag from the install wizard catalog',
  },
  {
    key: 'csat',
    defaultEnabled: true,
    description: 'CSAT addon flag from the install wizard catalog',
  },
  {
    key: 'autoAssign',
    defaultEnabled: false,
    description: 'Auto-assign addon flag from the install wizard catalog',
  },
  {
    key: 'approvals',
    defaultEnabled: true,
    description: 'Approvals addon flag from the install wizard catalog',
  },
  {
    key: 'confidential',
    defaultEnabled: true,
    description: 'Confidential tickets addon flag from the install wizard catalog',
  },
  {
    key: 'kbIntercept',
    defaultEnabled: true,
    description: 'Knowledge-base intercept addon flag from the install wizard catalog',
  },
  {
    key: 'timeTracking',
    defaultEnabled: true,
    description: 'Time tracking addon flag from the install wizard catalog',
  },
  {
    key: 'ticketSplit',
    defaultEnabled: true,
    description: 'Ticket split addon flag from the install wizard catalog',
  },
  {
    key: 'bulkActions',
    defaultEnabled: true,
    description: 'Bulk actions addon flag from the install wizard catalog',
  },
  {
    key: 'savedViews',
    defaultEnabled: true,
    description: 'Saved views addon flag from the install wizard catalog',
  },
  {
    key: 'reports',
    defaultEnabled: true,
    description: 'Reports addon flag from the install wizard catalog',
  },
  {
    key: 'serviceDowntime',
    defaultEnabled: true,
    description: 'Service downtime addon flag from the install wizard catalog',
  },
] as const;

export type InstallAddonKey = (typeof installAddonCatalog)[number]['key'];

export type InstallAddonCatalogItem = (typeof installAddonCatalog)[number];

export function addonSettingKey<K extends InstallAddonKey>(
  key: K,
): `private.addons.${K}` {
  return `private.addons.${key}`;
}

export function isInstallAddonKey(value: string): value is InstallAddonKey {
  return installAddonCatalog.some((item) => item.key === value);
}

export function addonRequiresSmtp(item: InstallAddonCatalogItem): boolean {
  return 'requiresSmtp' in item && item.requiresSmtp === true;
}
