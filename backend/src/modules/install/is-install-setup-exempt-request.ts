import { installSetupAllowlist } from './install-setup.constants';
import {
  normalizeInstallHttpMethod,
  normalizeInstallHttpPath,
} from './normalize-install-http-path';

export function isInstallSetupExemptRequest(input: {
  readonly method: unknown;
  readonly path: unknown;
}): boolean {
  const path = normalizeInstallHttpPath(input.path);
  if (
    path === installSetupAllowlist.installPathPrefix ||
    path.startsWith(`${installSetupAllowlist.installPathPrefix}/`)
  ) {
    return true;
  }
  return (
    normalizeInstallHttpMethod(input.method) ===
      installSetupAllowlist.healthMethod &&
    path === installSetupAllowlist.healthPath
  );
}
