export const settingKeys = {
  publicBrandingAppName: 'public.branding.appName',
  privateInstallCompletedAt: 'private.install.completedAt',
  privateAuthMode: 'private.auth.mode',
  privateAuthJwtSigningSecret: 'private.auth.jwtSigningSecret',
  privateAuthAzureTenantId: 'private.auth.azureTenantId',
  privateAuthAzureClientId: 'private.auth.azureClientId',
  privateAuthAdReadEnabled: 'private.auth.adRead.enabled',
  privateAuthAdReadStrategy: 'private.auth.adRead.strategy',
  privateAuthAdReadUsersBaseDn: 'private.auth.adRead.usersBaseDn',
  privateAuthAdReadGroupsBaseDn: 'private.auth.adRead.groupsBaseDn',
  privateAuthAdReadMaxQueriesPerSecond: 'private.auth.adRead.maxQueriesPerSecond',
  privateAuthAdReadCacheTtlMinutes: 'private.auth.adRead.cacheTtlMinutes',
  privateAuthAdReadOuTreeCacheTtlHours: 'private.auth.adRead.ouTreeCacheTtlHours',
} as const;

export type SettingKey = (typeof settingKeys)[keyof typeof settingKeys];
