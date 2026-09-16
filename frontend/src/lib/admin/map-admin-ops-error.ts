import type { AuditLogVerifyResult } from "@/services/audit-log-api";
import { ApiError } from "@/services/api";

export type AdminOpsMessageKey =
  | "admin.ops.needOrganizationalUnit"
  | "admin.ops.verifyDisabled"
  | "admin.ops.verifyValid"
  | "admin.ops.verifyBroken"
  | "admin.ops.errorForbidden"
  | "admin.ops.errorExportDisabled"
  | "admin.ops.errorGeneric";

export function mapAdminOpsError(error: unknown): AdminOpsMessageKey {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "admin.ops.errorForbidden";
    }
    if (error.code === "AUDIT_EXPORT_DISABLED") {
      return "admin.ops.errorExportDisabled";
    }
  }
  return "admin.ops.errorGeneric";
}

export function describeVerifyResult(result: AuditLogVerifyResult): {
  readonly tone: "muted" | "success" | "danger";
  readonly key: AdminOpsMessageKey;
  readonly values?: Record<string, string | number>;
} {
  if (!result.enabled) {
    return { tone: "muted", key: "admin.ops.verifyDisabled" };
  }
  if (result.valid) {
    return {
      tone: "success",
      key: "admin.ops.verifyValid",
      values: { count: result.checkedCount },
    };
  }
  return {
    tone: "danger",
    key: "admin.ops.verifyBroken",
    values: {
      index: result.firstMismatchIndex,
      id: result.firstMismatchId,
      count: result.checkedCount,
    },
  };
}
