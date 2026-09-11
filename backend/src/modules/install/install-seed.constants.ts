export const installSeedConstants = {
  changeLogReason: 'install_wizard',
  organizationalUnitName: 'Direkcija',
  organizationalUnitType: 'DIRECTORATE',
  distinguishedName: 'OU=Direkcija,DC=local',
  fallbackGroupName: 'Fallback',
  fallbackGroupKey: 'fallback',
  categoryName: 'Opšte',
  categorySlug: 'opste',
  serviceName: 'Opšti zahtjev',
  serviceSlug: 'opsti-zahtjev',
} as const;

/// Minimal schema-driven form so the seeded service can accept tickets.
/// Ticket.formVersionId is required, so an ACTIVE form version is mandatory.
export const installSeedFormSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'dodatne_informacije',
      label: 'Dodatne informacije',
      type: 'textarea',
      required: false,
      order: 0,
      validation: { maxLength: 4000 },
    },
  ],
} as const;

export const installSeedErrorCodes = {
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  routingUnresolved: 'SEED_ROUTING_UNRESOLVED',
} as const;
