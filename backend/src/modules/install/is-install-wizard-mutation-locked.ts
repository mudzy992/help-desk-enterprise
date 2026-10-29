import { installSetupAllowlist } from './install-setup.constants';
import {
  normalizeInstallHttpMethod,
  normalizeInstallHttpPath,
} from './normalize-install-http-path';

const installReadPathsOpenAfterCompletion: ReadonlySet<string> = new Set([
  '/install/status',
  '/install/addons',
]);

/**
 * Mutations the lock lets through after completion: finishing again (the wizard
 * retries `complete` idempotently) and the ops-only rerun (owner decision 6).
 * Both are guarded elsewhere — the rerun needs `INSTALL_ALLOW_RERUN=true` and the
 * install token, which it requires even after completion (`install-token.ts`).
 */
const unlockedInstallMutations: readonly {
  readonly method: string;
  readonly path: string;
}[] = [
  {
    method: installSetupAllowlist.completeMethod,
    path: installSetupAllowlist.completePath,
  },
  {
    method: installSetupAllowlist.restartMethod,
    path: installSetupAllowlist.restartPath,
  },
];

export function isInstallWizardMutationLocked(input: {
  readonly method: unknown;
  readonly path: unknown;
  readonly isCompleted: boolean;
}): boolean {
  if (!input.isCompleted) {
    return false;
  }
  const path = normalizeInstallHttpPath(input.path);
  if (
    path !== installSetupAllowlist.installPathPrefix &&
    !path.startsWith(`${installSetupAllowlist.installPathPrefix}/`)
  ) {
    return false;
  }
  const method = normalizeInstallHttpMethod(input.method);
  if (method === 'OPTIONS') {
    return false;
  }
  if (method === 'GET' || method === 'HEAD') {
    // Review 2026-09-25: these steps are unauthenticated; after completion they
    // exposed the super admin e-mail, SMTP host/user and the Entra tenant to
    // anyone. Only the status and the add-on catalog (settings page) stay open.
    return !installReadPathsOpenAfterCompletion.has(path);
  }
  return !unlockedInstallMutations.some(
    (unlocked) => unlocked.method === method && unlocked.path === path,
  );
}
