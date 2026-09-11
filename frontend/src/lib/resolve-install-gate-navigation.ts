export const installRoutePath = "/install";

export function isInstallRoute(pathname: string): boolean {
  return (
    pathname === installRoutePath ||
    pathname.startsWith(`${installRoutePath}/`)
  );
}

export function resolveInstallGateNavigation(input: {
  readonly pathname: string;
  readonly isSetupComplete: boolean;
}): string | null {
  if (input.isSetupComplete) {
    return null;
  }
  if (isInstallRoute(input.pathname)) {
    return null;
  }
  return installRoutePath;
}
