/**
 * F0.7/F1: `GET /install/readiness` and `INSTALL_NOT_READY` both send
 * `install.readiness.<key>` (the backend builds it with
 * `installReadinessMessageKey`). The map keeps the frontend typed — a check the
 * frontend does not know yet falls back to its key instead of throwing.
 */
const readinessMessageKeys = {
  superAdmin: "install.readiness.superAdmin",
  authMode: "install.readiness.authMode",
  organizationalUnit: "install.readiness.organizationalUnit",
  handlerGroup: "install.readiness.handlerGroup",
  service: "install.readiness.service",
  routing: "install.readiness.routing",
  slaProfile: "install.readiness.slaProfile",
  roles: "install.readiness.roles",
  profileSteps: "install.readiness.profileSteps",
} as const;

export type InstallReadinessMessageKey =
  (typeof readinessMessageKeys)[keyof typeof readinessMessageKeys];

export function installReadinessMessageKey(checkKey: string): InstallReadinessMessageKey | null {
  const short = checkKey.replace(/^install\.readiness\./, "");
  const key = (readinessMessageKeys as Record<string, InstallReadinessMessageKey>)[short];
  return key ?? null;
}
