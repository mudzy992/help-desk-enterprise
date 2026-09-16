import { apiDownloadRequest, apiRequest } from "@/services/api";

export type AuditExportFormat = "csv" | "json";

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
