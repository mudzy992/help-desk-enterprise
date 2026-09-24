import { apiDownloadRequest, apiRequest } from "@/services/api";

export type AuditExportFormat = "csv" | "json";

export type AuditLogListRow = {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorUserId: string | null;
  readonly organizationalUnitId: string | null;
  readonly requestId: string | null;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly metadata: unknown;
};

export type AuditLogListResult = {
  readonly items: readonly AuditLogListRow[];
  readonly nextCursor: string | null;
};

export type AuditLogVerifyResult =
  | {
      readonly enabled: false;
      readonly status: "disabled";
    }
  | {
      readonly enabled: true;
      readonly valid: true;
      readonly checkedCount: number;
    }
  | {
      readonly enabled: true;
      readonly valid: false;
      readonly checkedCount: number;
      readonly firstMismatchId: string;
      readonly firstMismatchIndex: number;
    };

export async function exportAuditLog(input: {
  readonly organizationalUnitId: string;
  readonly format: AuditExportFormat;
}): Promise<{ readonly blob: Blob; readonly fileName: string }> {
  const query = new URLSearchParams({
    organizationalUnitId: input.organizationalUnitId,
    format: input.format,
  });
  const downloaded = await apiDownloadRequest(
    `/audit-logs/export?${query.toString()}`,
  );
  return {
    blob: downloaded.blob,
    fileName:
      downloaded.fileName ??
      (input.format === "csv" ? "audit-log.csv" : "audit-log.json"),
  };
}

export function verifyAuditLogChain(): Promise<AuditLogVerifyResult> {
  return apiRequest("/audit-logs/verify", { method: "POST" });
}

export function listAuditLogs(input: {
  readonly organizationalUnitId: string;
  readonly take?: number;
  readonly cursor?: string | null;
}): Promise<AuditLogListResult> {
  const query = new URLSearchParams({
    organizationalUnitId: input.organizationalUnitId,
  });
  if (input.take !== undefined) {
    query.set("take", String(input.take));
  }
  if (input.cursor != null && input.cursor.length > 0) {
    query.set("cursor", input.cursor);
  }
  return apiRequest(`/audit-logs?${query.toString()}`);
}
