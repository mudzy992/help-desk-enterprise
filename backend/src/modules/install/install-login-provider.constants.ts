export const installLoginProviderConstants = {
  changeLogReason: 'install_wizard',
  maximumDirectoryObjectIdLength: 40,
  maximumLdapsUrlsCsvLength: 2000,
  maximumBindDnLength: 512,
  maximumBindPasswordLength: 256,
  ldapsUrlPattern: /^ldaps:\/\/[A-Za-z0-9._-]+(?::\d{1,5})?$/i,
} as const;

export const installLoginProviderErrorCodes = {
  invalidConfiguration: 'INVALID_LOGIN_PROVIDER_CONFIGURATION',
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
} as const;
