import type { ReportTrendGranularity, ReportTrendPriority } from './report-trends.constants';

export type ReportTrendsQuery = {
  readonly organizationalUnitId: string;
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: ReportTrendGranularity;
  readonly serviceId?: string;
  readonly groupId?: string;
  readonly priority?: ReportTrendPriority;
};

export type ReportTrendsConfiguration = {
  readonly enabled: boolean;
  readonly maxMonths: number;
  readonly cacheSeconds: number;
  readonly slaTargetPercent: number;
  readonly csatMinSample: number;
  /**
   * M9/B3 (drugi dio): skala dolazi iz `private.csat.scaleMax`, pa serije
   * trendova koriste isti prag „zadovoljan” kao Pregled i tab CSAT.
   */
  readonly csatScaleMax: number;
  readonly timeZone: string;
};

/** What the data source is asked for (already scoped and bucketed). */
export type ReportTrendLoadInput = {
  readonly organizationalUnitIds: readonly string[];
  /**
   * M9/B3 (drugi dio): prag „zadovoljan” (`satisfiedMinRating(scaleMax)`) koji
   * izvori koriste da razvrstaju ocjene; do sada su SQL i in-memory izvor imali
   * konstantu 4 bez obzira na postavku.
   */
  readonly csatSatisfiedMinRating: number;
  readonly serviceId?: string;
  readonly groupId?: string;
  readonly priority?: ReportTrendPriority;
  /** Bucket starts followed by the end of the last bucket (ascending). */
  readonly boundaries: readonly Date[];
  readonly previous: { readonly start: Date; readonly end: Date };
};

export type ReportTrendFlowKind =
  | 'created'
  | 'resolved'
  | 'openAtStart'
  | 'slaResponse'
  | 'slaResolution'
  | 'resolvedWithoutSla';

/**
 * One aggregate row. `bucket` is 1-based (PostgreSQL `width_bucket`) for the
 * bucketed kinds and 0 for the whole-range totals.
 */
export type ReportTrendFlowRow = {
  readonly kind: ReportTrendFlowKind;
  readonly bucket: number;
  readonly count: number;
  /** SLA kinds: how many met the target. */
  readonly met: number | null;
  /** created: first response; resolved: resolution — seconds. */
  readonly p50Seconds: number | null;
  readonly p90Seconds: number | null;
  readonly sampleCount: number | null;
};

export type ReportTrendCsatRow = {
  readonly bucket: number;
  readonly count: number;
  readonly ratingSum: number;
  readonly satisfied: number;
};

export type ReportTrendServiceRow = {
  readonly serviceId: string;
  readonly name: string | null;
  readonly current: number;
  readonly previous: number;
};

export type ReportTrendRawData = {
  readonly flow: readonly ReportTrendFlowRow[];
  readonly csat: readonly ReportTrendCsatRow[];
  readonly services: readonly ReportTrendServiceRow[];
};

export interface ReportTrendSource {
  load(input: ReportTrendLoadInput): Promise<ReportTrendRawData>;
}

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

export type ReportTrends = {
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
