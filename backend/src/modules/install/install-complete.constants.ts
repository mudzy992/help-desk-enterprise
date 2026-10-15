export const installCompleteConstants = {
  changeLogReason: 'install_wizard',
} as const;

export const installCompleteErrorCodes = {
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  /**
   * Install wizard v2 (F0.7): the installation is not ready for tickets
   * (`00_overview.md` §3). The response lists the keys that are not green.
   */
  notReady: 'INSTALL_NOT_READY',
} as const;
