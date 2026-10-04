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
  readonly kbHelpedCount: number;
  readonly kbResolutionRate: number | null;
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
  /** Val 1 (M15/B1): postavka uskih grla stvarno isključuje i podatke i prikaz. */
  readonly bottlenecksEnabled: boolean;
  readonly bottleneckByGroup: readonly ReportDashboardNamedBar[];
  readonly serviceVolume: readonly ReportDashboardNamedBar[];
  /** Val 1 (M15 gap): tiketi kreirani u periodu, po organizacionoj jedinici. */
  readonly originUnitVolume: readonly ReportDashboardNamedBar[];
  /** Val 1 (M15 gap): „opterećenje admina“ — otvoreni tiketi po izvršiocu. */
  readonly assigneeWorkload: readonly ReportDashboardNamedBar[];
  readonly volumeSeries: readonly ReportDashboardVolumePoint[];
  readonly aging: ReportDashboardAging;
};

export type ReportsDashboardQuery = {
  readonly organizationalUnitId: string;
  readonly from: string;
  readonly to: string;
};

export type BottleneckCounts = {
  readonly pendingApproval: number;
  readonly waitingForUser: number;
  readonly unrouted: number;
  readonly overdue: number;
};

export type BottleneckBreakdownRow = BottleneckCounts & {
  readonly key: string;
  /** Val 1 (M15/B2): naziv za prikaz (za prioritet je vrijednost enuma). */
  readonly label: string;
};

export type BottleneckTrendRow = BottleneckCounts & {
  readonly date: string;
  readonly createdCount: number;
};

/** Val 1 (M15/B2): `GET /reports/bottlenecks` — usko grlo po OU/servisu/prioritetu + trend. */
export type BottlenecksResponse = {
  readonly window: { readonly from: string; readonly to: string };
  readonly counts: BottleneckCounts;
  readonly byOrganizationalUnit: readonly BottleneckBreakdownRow[];
  readonly byService: readonly BottleneckBreakdownRow[];
  readonly byPriority: readonly BottleneckBreakdownRow[];
  readonly trend: readonly BottleneckTrendRow[];
};

export function fetchBottlenecks(
  query: ReportsDashboardQuery,
): Promise<BottlenecksResponse> {
  const params = new URLSearchParams({
    organizationalUnitId: query.organizationalUnitId,
    from: query.from,
    to: query.to,
  });
  return apiRequest(`/reports/bottlenecks?${params.toString()}`);
}

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
