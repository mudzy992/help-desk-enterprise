export const installAddonsConstants = {
  changeLogReason: 'install_wizard',
} as const;

export const installAddonsErrorCodes = {
  invalidConfiguration: 'INVALID_ADDON_CONFIGURATION',
  unsupportedAddon: 'UNSUPPORTED_ADDON_KEY',
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
} as const;
