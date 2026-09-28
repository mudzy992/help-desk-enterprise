import { apiDownloadRequest, apiRequest } from "@/services/api";
import type { ReportExportFormat } from "@/services/report-packs-api";

/** Paket 2.5 (design §4.4): `GET /reports/trends` — mirrors backend `ReportTrends`. */
export const reportTrendGranularities = ["day", "week", "month"] as const;
export type ReportTrendGranularity = (typeof reportTrendGranularities)[number];

export const reportTrendPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ReportTrendPriority = (typeof reportTrendPriorities)[number];

export type ReportTrendDuration = {
  readonly medianHours: number | null;
  readonly p90Hours: number | null;
  readonly sampleCount: number;
};

export type ReportTrendRatio = {
  readonly total: number;
  readonly met: number;
  readonly percent: number | null;
};

export type ReportTrendCsat = {
  readonly count: number;
  readonly average: number | null;
  readonly satisfiedPercent: number | null;
  readonly lowSample: boolean;
};

export type ReportTrendPoint = {
  readonly key: string;
  readonly start: string;
  readonly end: string;
  readonly partial: boolean;
  readonly created: number;
  readonly resolved: number;
  readonly net: number;
  readonly backlog: number;
  readonly firstResponse: ReportTrendDuration;
  readonly resolution: ReportTrendDuration;
  readonly slaResponse: ReportTrendRatio;
  readonly slaResolution: ReportTrendRatio;
  readonly csat: ReportTrendCsat;
};

export type ReportTrendService = {
  readonly serviceId: string;
  readonly name: string;
  readonly current: number;
  readonly previous: number;
  readonly changePercent: number | null;
};

export type ReportTrendsResponse = {
  readonly granularity: ReportTrendGranularity;
  readonly timeZone: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly previousWindow: { readonly from: string; readonly to: string };
  readonly generatedAt: string;
  readonly filters: {
    readonly organizationalUnitId: string;
    readonly serviceId: string | null;
    readonly groupId: string | null;
    readonly priority: ReportTrendPriority | null;
  };
  readonly points: readonly ReportTrendPoint[];
  readonly totals: {
    readonly created: number;
    readonly resolved: number;
    readonly net: number;
    readonly backlogStart: number;
    readonly backlogEnd: number;
    readonly slaResponse: ReportTrendRatio;
    readonly slaResolution: ReportTrendRatio;
    readonly csat: ReportTrendCsat;
    readonly resolvedWithoutSla: number;
  };
  readonly topServices: {
    readonly items: readonly ReportTrendService[];
    readonly other: { readonly current: number; readonly previous: number };
    readonly totalCurrent: number;
    readonly totalPrevious: number;
  };
  readonly settings: {
    readonly slaTargetPercent: number;
    readonly csatMinSample: number;
    readonly csatScaleMax: number;
    readonly csatSatisfiedMinRating: number;
  };
};

export type ReportTrendsQuery = {
  readonly organizationalUnitId: string;
  /** `YYYY-MM-DD`, civil dates in the report time zone. */
  readonly from: string;
  readonly to: string;
  readonly granularity?: ReportTrendGranularity;
  readonly serviceId?: string;
  readonly groupId?: string;
  readonly priority?: ReportTrendPriority;
};

export function buildReportTrendsSearch(
  query: ReportTrendsQuery,
  format?: ReportExportFormat,
): string {
  const params = new URLSearchParams({
    organizationalUnitId: query.organizationalUnitId,
    from: query.from,
    to: query.to,
  });
  if (query.granularity !== undefined) params.set("granularity", query.granularity);
  if (query.serviceId !== undefined) params.set("serviceId", query.serviceId);
  if (query.groupId !== undefined) params.set("groupId", query.groupId);
  if (query.priority !== undefined) params.set("priority", query.priority);
  if (format !== undefined) params.set("format", format);
  return params.toString();
}

export function fetchReportTrends(query: ReportTrendsQuery): Promise<ReportTrendsResponse> {
  return apiRequest(`/reports/trends?${buildReportTrendsSearch(query)}`);
}

export async function downloadReportTrends(
  query: ReportTrendsQuery,
  format: ReportExportFormat,
): Promise<{ readonly blob: Blob; readonly fileName: string }> {
  const downloaded = await apiDownloadRequest(
    `/reports/trends/export?${buildReportTrendsSearch(query, format)}`,
  );
  return {
    blob: downloaded.blob,
    fileName: downloaded.fileName ?? `trendovi-${query.from}-${query.to}.${format}`,
  };
}

/** Design §6: audit beacon for „Izvezi PDF” (the print dialog itself is local). */
export function recordReportPdfExport(input: {
  readonly organizationalUnitId: string;
  readonly view: "overview" | "trends";
  readonly from?: string;
  readonly to?: string;
}): Promise<void> {
  return apiRequest("/reports/pdf-exports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
