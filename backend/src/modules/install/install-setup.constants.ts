export const installSetupErrorCodes = {
  setupRequired: 'SETUP_REQUIRED',
  setupDatabaseUnavailable: 'SETUP_DATABASE_UNAVAILABLE',
  installLocked: 'INSTALL_LOCKED',
} as const;

export const installSetupAllowlist = {
  healthMethod: 'GET',
  healthPath: '/health',
  readyPath: '/health/ready',
  brandingPath: '/branding',
  installPathPrefix: '/install',
  completeMethod: 'POST',
  completePath: '/install/complete',
} as const;
