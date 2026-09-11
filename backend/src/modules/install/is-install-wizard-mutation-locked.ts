import { installSetupAllowlist } from './install-setup.constants';
import {
  normalizeInstallHttpMethod,
  normalizeInstallHttpPath,
} from './normalize-install-http-path';

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
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return false;
  }
  return !(
    method === installSetupAllowlist.completeMethod &&
    path === installSetupAllowlist.completePath
  );
}
