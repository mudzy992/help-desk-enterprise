export const installProfileConstants = {
  changeLogReason: 'install_profile',
} as const;

export const installProfileErrorCodes = {
  /**
   * Owner decision 5 allows changing the package while the operator is back on
   * the package step, but once the initial data exists a *lower* package may no
   * longer be written — the steps it drops have already produced records.
   */
  downgradeLockedAfterSeed: 'INSTALL_PROFILE_LOCKED_AFTER_SEED',
} as const;

export const installStepSkipConstants = {
  changeLogReason: 'install_step_skip',
} as const;

export const installStepSkipErrorCodes = {
  unknownStep: 'INSTALL_STEP_UNKNOWN',
  notSkippable: 'INSTALL_STEP_NOT_SKIPPABLE',
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
} as const;
