/**
 * Owner decision 6 (install wizard v2): reopening a finished installation is an
 * ops action, never a product feature. Two independent switches guard it — the
 * `INSTALL_ALLOW_RERUN=true` environment flag and the install token that every
 * `/install` route already needs — so a regular administrator cannot reach it
 * and an accidental deploy cannot unlock a running system.
 */
export const installRerunEnvironmentKey = 'INSTALL_ALLOW_RERUN';

export const installRerunConstants = {
  method: 'POST',
  path: '/install/restart',
  /** Change-log reason of every write the rerun makes (`UPSERT` + this reason). */
  changeLogReason: 'install_wizard_rerun',
} as const;

export const installRerunErrorCodes = {
  notAllowed: 'INSTALL_RERUN_NOT_ALLOWED',
} as const;
