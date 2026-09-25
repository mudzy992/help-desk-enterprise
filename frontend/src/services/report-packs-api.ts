import { apiDownloadRequest, apiRequest } from "@/services/api";

/** Package 1.6: report packs (list, preview, download). */
export type ReportPackKey =
  | "monthly_kpi"
  | "overdue_by_service"
  | "top_close_codes"
  | "kb_helpfulness"
  | "forward_ping_pong"
  | "time_tracking";

export type ReportExportFormat = "csv" | "json";

export type ReportPackDescriptor = {
  readonly key: ReportPackKey;
  readonly slug: string;
  readonly columns: readonly string[];
};

export type ReportPackList = {
  readonly packs: readonly ReportPackDescriptor[];
  readonly formats: readonly ReportExportFormat[];
  readonly limits: {
    readonly previewRows: number;
    readonly exportRows: number;
    readonly maxWindowDays: number;
  };
  readonly pingPongThreshold: number;
};

export type ReportCell = string | number | null;

export type ReportPackPreview = {
  readonly pack: ReportPackKey;
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, ReportCell>[];
  readonly totalRows: number;
  readonly truncated: boolean;
  readonly window: { readonly from: string; readonly to: string };
};

export type ReportPackScope = {
  readonly organizationalUnitId: string;
  readonly from: string;
  readonly to: string;
};

export function buildReportPackQuery(
  scope: ReportPackScope,
  format?: ReportExportFormat,
): string {
  const params = new URLSearchParams({
    organizationalUnitId: scope.organizationalUnitId,
    from: scope.from,
    to: scope.to,
  });
  if (format !== undefined) {
    params.set("format", format);
  }
  return params.toString();
}

export function listReportPacks(organizationalUnitId: string): Promise<ReportPackList> {
  const params = new URLSearchParams({ organizationalUnitId });
  return apiRequest(`/reports/packs?${params.toString()}`);
}

export function previewReportPack(
  slug: string,
  scope: ReportPackScope,
): Promise<ReportPackPreview> {
  return apiRequest(
    `/reports/packs/${encodeURIComponent(slug)}/preview?${buildReportPackQuery(scope)}`,
  );
}

export async function downloadReportPack(
  slug: string,
  scope: ReportPackScope,
  format: ReportExportFormat,
): Promise<{ readonly blob: Blob; readonly fileName: string }> {
  const downloaded = await apiDownloadRequest(
    `/reports/packs/${encodeURIComponent(slug)}?${buildReportPackQuery(scope, format)}`,
  );
  return { blob: downloaded.blob, fileName: downloaded.fileName ?? `${slug}.${format}` };
}
