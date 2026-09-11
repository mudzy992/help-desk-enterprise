export const installSetupErrorCodes = {
  setupRequired: 'SETUP_REQUIRED',
} as const;

export const installSetupAllowlist = {
  healthMethod: 'GET',
  healthPath: '/health',
  installPathPrefix: '/install',
} as const;
