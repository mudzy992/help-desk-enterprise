export const installSetupErrorCodes = {
  setupRequired: 'SETUP_REQUIRED',
  installLocked: 'INSTALL_LOCKED',
} as const;

export const installSetupAllowlist = {
  healthMethod: 'GET',
  healthPath: '/health',
  installPathPrefix: '/install',
  completeMethod: 'POST',
  completePath: '/install/complete',
} as const;
