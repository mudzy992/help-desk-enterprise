import { apiRequest } from "@/services/api";

export type ReportDashboardKpis = {
  readonly createdCount: number;
  readonly createdDeltaPercent: number | null;
  readonly firstResponseMinutes: number | null;
  readonly firstResponseSampleCount: number;
  readonly firstResponseDeltaMinutes: number | null;
  readonly resolutionHours: number | null;
  readonly resolutionSampleCount: number;
  readonly resolutionDeltaHours: number | null;
  readonly csatAverage: number | null;
  readonly csatCount: number;
  readonly csatScaleMax: number;
};

export type ReportDashboardNamedBar = {
  readonly key: string;
  readonly label: string;
  readonly value: number;
};

export type ReportDashboardVolumePoint = {
  readonly d: string;
  readonly created: number;
  readonly resolved: number;
};

export type ReportDashboardAging = {
  readonly lessThanOneDay: number;
  readonly oneToThreeDays: number;
  readonly threeToSevenDays: number;
  readonly moreThanSevenDays: number;
  readonly waitingOverSevenDays: number;
};

export type ReportsDashboardResponse = {
  readonly window: { readonly from: string; readonly to: string };
  readonly previousWindow: { readonly from: string; readonly to: string };
  readonly ticketCount: number;
  readonly kpis: ReportDashboardKpis;
  readonly bottleneckByGroup: readonly ReportDashboardNamedBar[];
  readonly serviceVolume: readonly ReportDashboardNamedBar[];
  readonly volumeSeries: readonly ReportDashboardVolumePoint[];
  readonly aging: ReportDashboardAging;
};

export type ReportsDashboardQuery = {
  readonly organizationalUnitId: string;
  readonly from: string;
  readonly to: string;
};

export function fetchReportsDashboard(
  query: ReportsDashboardQuery,
): Promise<ReportsDashboardResponse> {
  const params = new URLSearchParams({
    organizationalUnitId: query.organizationalUnitId,
    from: query.from,
    to: query.to,
  });
  return apiRequest(`/reports/dashboard?${params.toString()}`);
}
