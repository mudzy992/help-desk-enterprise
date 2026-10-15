import { installRerunConstants } from './install-rerun.constants';

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
  // Owner decision 6: the ops-only rerun. The path and the method live in
  // `install-rerun.constants.ts` (the runbook and the controller quote them from
  // there); here they only take part in the lock and the token rules.
  restartMethod: installRerunConstants.method,
  restartPath: installRerunConstants.path,
} as const;
