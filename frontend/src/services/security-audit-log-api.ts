import { apiRequest } from "@/services/api";
import type { AuditLogListRow } from "@/services/audit-log-api";

/**
 * Paket 5.4.0-d (M6): the admin security journal.
 *
 * `GET /security/audit-log` is a filtered view over the existing audit log: it
 * is limited to `auth.` actions (the server pins the prefix), SUPER_ADMIN-only
 * and paginated with the same `take`/`cursor` window as the OU-scoped audit
 * list. The server answers with `Cache-Control: no-store`.
 */
export type SecurityAuditLogRow = AuditLogListRow;

export type SecurityAuditLogResult = {
  readonly items: readonly SecurityAuditLogRow[];
  readonly nextCursor: string | null;
};

export const securityAuditLogPageTake = 50;

/** Only exact `auth.*` actions may be filtered; anything else is ignored. */
export function buildSecurityAuditLogQuery(input: {
  readonly action?: string | null;
  readonly userId?: string | null;
  readonly take?: number;
  readonly cursor?: string | null;
}): string {
  const query = new URLSearchParams();
  query.set("take", String(input.take ?? securityAuditLogPageTake));
  const action = input.action?.trim() ?? "";
  if (action.length > 0 && action.startsWith("auth.")) {
    query.set("action", action);
  }
  const userId = input.userId?.trim() ?? "";
  if (userId.length > 0) {
    query.set("userId", userId);
  }
  const cursor = input.cursor?.trim() ?? "";
  if (cursor.length > 0) {
    query.set("cursor", cursor);
  }
  return query.toString();
}

export function listSecurityAuditLog(input: {
  readonly action?: string | null;
  readonly userId?: string | null;
  readonly take?: number;
  readonly cursor?: string | null;
}): Promise<SecurityAuditLogResult> {
  return apiRequest(`/security/audit-log?${buildSecurityAuditLogQuery(input)}`);
}
