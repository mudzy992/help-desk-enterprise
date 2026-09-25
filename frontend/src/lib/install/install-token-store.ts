/**
 * Review 2026-09-25 (S4): the install wizard needs the operator's INSTALL_TOKEN.
 * It is kept only for the browser tab (sessionStorage) and sent as
 * `X-Install-Token` on every `/install/` request.
 */
const storageKey = "helpdesk.installToken";

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage ?? null;
}

export function readInstallToken(): string | null {
  return storage()?.getItem(storageKey) ?? null;
}

export function writeInstallToken(token: string): void {
  storage()?.setItem(storageKey, token.trim());
}

export function clearInstallToken(): void {
  storage()?.removeItem(storageKey);
}

export function installTokenHeaders(path: string): Record<string, string> {
  if (!path.startsWith("/install/")) return {};
  const token = readInstallToken();
  return token === null ? {} : { "X-Install-Token": token };
}
