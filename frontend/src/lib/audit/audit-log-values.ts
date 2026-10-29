export const knownAuditMetadataValues: Readonly<Record<string, readonly string[]>> = {
  membership: ["added", "removed"],
  severity: ["INFO", "WARNING", "CRITICAL"],
  decision: ["SUPER_ADMIN_ALLOWED"],
  permissionMatchMode: ["any", "all"],
  status: ["must_change"],
  directoryKind: ["entra", "ldaps"],
  provider: ["local", "entra", "legacy"],
  channel: ["email", "teams", "EMAIL", "PAPER", "PORTAL", "IN_PERSON"],
  // closeout: codes the backend writes into these fields today.
  // Incident statuses travel in `from` / `to` of `status.incident.*` events.
  from: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"],
  to: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"],
  reason: ["admin_reset", "fallback_reassigned", "DIRECTORY_ACCOUNT_NOT_LOCAL"],
  source: ["manual_directory_catalog"],
  via: ["admin", "server", "rekey-asset-licenses", "seed-default-role-permissions"],
  format: ["csv", "json", "xlsx"],
};
