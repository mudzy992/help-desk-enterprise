export const installRoutePath = "/install";
export const applicationHomePath = "/";

export const visualQaRoutePath = "/_visual-qa";

export function isInstallRoute(pathname: string): boolean {
  return (
    pathname === installRoutePath ||
    pathname.startsWith(`${installRoutePath}/`)
  );
}

export function isVisualQaRoute(pathname: string): boolean {
  return pathname === visualQaRoutePath;
}

export function resolveInstallGateNavigation(input: {
  readonly pathname: string;
  readonly isSetupComplete: boolean;
}): string | null {
  if (isVisualQaRoute(input.pathname)) {
    return null;
  }
  if (input.isSetupComplete) {
    return isInstallRoute(input.pathname) ? applicationHomePath : null;
  }
  if (isInstallRoute(input.pathname)) {
    return null;
  }
  return installRoutePath;
}
