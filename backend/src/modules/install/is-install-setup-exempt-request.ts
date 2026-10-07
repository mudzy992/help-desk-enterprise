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
  // Paket 4.1: the wizard and login page render the client's branding.
  return (
    normalizeInstallHttpMethod(input.method) ===
      installSetupAllowlist.healthMethod &&
    (path === installSetupAllowlist.healthPath ||
      path === installSetupAllowlist.readyPath ||
      path === installSetupAllowlist.brandingPath)
  );
}
