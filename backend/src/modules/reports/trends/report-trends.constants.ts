/** Paket 2.5 (T): trend dashboard limits and defaults (design §3, §8). */

export const reportTrendGranularities = ['day', 'week', 'month'] as const;
export type ReportTrendGranularity = (typeof reportTrendGranularities)[number];

/** Most buckets a request may ask for, per granularity (design §3). */
export const reportTrendBucketLimits = {
  day: 92,
  week: 104,
  /** The month limit is the `private.reports.trends.maxMonths` setting. */
} as const;

/** Automatic granularity: up to 31 days → day, up to ~6 months → week, else month. */
export const reportTrendAutoGranularity = {
  dayMaxDays: 31,
  weekMaxDays: 183,
} as const;

export const reportTrendDefaults = {
  enabled: true,
  maxMonths: 36,
  cacheSeconds: 600,
  slaTargetPercent: 90,
  csatMinSample: 5,
  defaultWindowMonths: 12,
} as const;

export const reportTrendSettingRanges = {
  maxMonths: { min: 12, max: 60 },
  cacheSeconds: { min: 60, max: 3600 },
  slaTargetPercent: { min: 50, max: 100 },
  csatMinSample: { min: 1, max: 50 },
} as const;

/** CSAT „zadovoljan” = ocjena ≥ 4 na skali 1–5 (design §12 pitanje 8). */
export const reportCsatSatisfiedMinRating = 4;
export const reportCsatScaleMax = 5;

/** How many services the „top servisi” table lists before „Ostalo”. */
export const reportTrendTopServiceLimit = 8;

export const reportTrendPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ReportTrendPriority = (typeof reportTrendPriorities)[number];
