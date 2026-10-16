export const installRoutePath = "/install";
export const applicationHomePath = "/";

export const visualQaRoutePath = "/_visual-qa";

export function isInstallRoute(pathname: string): boolean {
  return pathname === installRoutePath || pathname.startsWith(`${installRoutePath}/`);
}

/** The primitives QA page is registered in development builds only. */
export function isVisualQaRoute(pathname: string): boolean {
  return import.meta.env.DEV && pathname === visualQaRoutePath;
}

export function resolveInstallGateNavigation(input: {
  readonly pathname: string;
  readonly isSetupComplete: boolean;
}): string | null {
  if (isVisualQaRoute(input.pathname)) {
    return null;
  }
  // F6.2: after finish, „Sistem je spreman“ still lives on /install (link to
  // /login). Bouncing completed installs off /install hid that screen.
  if (input.isSetupComplete) {
    return null;
  }
  if (isInstallRoute(input.pathname)) {
    return null;
  }
  return installRoutePath;
}
