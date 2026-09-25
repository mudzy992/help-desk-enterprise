import { installSetupAllowlist } from './install-setup.constants';
import {
  normalizeInstallHttpMethod,
  normalizeInstallHttpPath,
} from './normalize-install-http-path';

const installReadPathsOpenAfterCompletion: ReadonlySet<string> = new Set([
  '/install/status',
  '/install/addons',
]);

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
  return !(
    method === installSetupAllowlist.completeMethod &&
    path === installSetupAllowlist.completePath
  );
}
