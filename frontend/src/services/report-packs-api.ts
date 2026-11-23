import { apiDownloadRequest, apiRequest } from "@/services/api";

/** report packs (list, preview, download). */
export type ReportPackKey =
  | "monthly_kpi"
  | "overdue_by_service"
  | "top_close_codes"
  | "kb_helpfulness"
  | "forward_ping_pong"
  | "time_tracking"
  // Available only while the CMDB module is enabled.
  | "asset_inventory"
  | "asset_expiring"
  | "asset_license_compliance"
  | "asset_top_tickets"
  | "asset_inactive_holders"
  | "problem_top"
  | "problem_time_to_known_error"
  | "problem_time_to_resolution"
  | "problem_backlog"
  | "problem_recurrence"
  // Available only while the change module is enabled.
  | "change_outcomes"
  | "change_schedule";

export type ReportExportFormat = "csv" | "json";

/** W7.102 (`BA-reports-12`): what the period selects, and what it deliberately does not. */
export type ReportPackWindowMode = "event-time" | "snapshot-time" | "mixed";

export type ReportPackWindowSemantics = {
  readonly mode: ReportPackWindowMode;
  /** Timestamps the period filters on (`entity.field`); empty for a snapshot pack. */
  readonly eventTime: readonly string[];
  /** Parts read as the state at generation time; empty for a pure event-time pack. */
  readonly snapshotParts: readonly string[];
  readonly selection: "instant" | "overlap" | "none";
  /** Always `[from, to)`: the start is inside the period, the end is not. */
  readonly boundaries: "[from, to)";
};

export type ReportPackDescriptor = {
  readonly key: ReportPackKey;
  readonly slug: string;
  readonly columns: readonly string[];
  readonly windowSemantics: ReportPackWindowSemantics;
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
  /** W7.53: the scoped corpus is larger than the read budget (counts are a floor). */
  readonly truncatedInput: boolean;
  readonly window: {
    readonly from: string;
    readonly to: string;
    readonly boundaries: "[from, to)";
    readonly semantics: ReportPackWindowSemantics;
  };
};

export type ReportPackScope = {
  readonly organizationalUnitId: string;
  readonly from: string;
  readonly to: string;
};

export function buildReportPackQuery(scope: ReportPackScope, format?: ReportExportFormat): string {
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
