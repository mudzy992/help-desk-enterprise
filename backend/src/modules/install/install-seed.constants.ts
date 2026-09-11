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

export const installSeedErrorCodes = {
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  routingUnresolved: 'SEED_ROUTING_UNRESOLVED',
} as const;
