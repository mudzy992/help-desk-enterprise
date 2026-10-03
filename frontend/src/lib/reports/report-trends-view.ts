import { ApiError } from "@/services/api";
import {
  reportTrendGranularities,
  reportTrendPriorities,
  type ReportTrendGranularity,
  type ReportTrendPriority,
  type ReportTrendsQuery,
} from "@/services/report-trends-api";
import { addLocalDays, addLocalMonths, parseDateInputValue, toDateInputValue } from "./report-window";

/**
 * Paket 2.5 (design §7.2): the Trends tab state lives in the URL
 * (`/reports?tab=trends&…`) so a view can be shared and the scheduled e-mail
 * can link straight to it. Everything here is pure and unit-tested.
 */
export const trendPresets = ["30d", "90d", "6m", "12m", "24m", "36m", "custom"] as const;
export type TrendPreset = (typeof trendPresets)[number];

export type TrendsViewState = {
  readonly preset: TrendPreset;
  readonly from: string;
  readonly to: string;
  /** `null` = automatic (the backend picks, design §3). */
  readonly granularity: ReportTrendGranularity | null;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly groupId: string | null;
  readonly priority: ReportTrendPriority | null;
};

/** Mirrors backend `reportTrendAutoGranularity` and `reportTrendBucketLimits`. */
export const trendAutoGranularity = { dayMaxDays: 31, weekMaxDays: 183 } as const;
export const trendBucketLimits = { day: 92, week: 104 } as const;

const monthPresets: Partial<Record<TrendPreset, number>> = { "6m": 6, "12m": 12, "24m": 24, "36m": 36 };
const dayPresets: Partial<Record<TrendPreset, number>> = { "30d": 30, "90d": 90 };

/**
 * Month presets start on the 1st so every bucket but the current one is a
 * whole month; day presets end today and include it.
 */
export function resolveTrendPresetRange(preset: TrendPreset, now: Date): { from: string; to: string } | null {
  const days = dayPresets[preset];
  if (days !== undefined) {
    return { from: toDateInputValue(addLocalDays(now, 1 - days)), to: toDateInputValue(now) };
  }
  const months = monthPresets[preset];
  if (months !== undefined) {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toDateInputValue(addLocalMonths(firstOfMonth, 1 - months)), to: toDateInputValue(now) };
  }
  return null;
}

export function daysBetweenInclusive(from: string, to: string): number | null {
  const start = parseDateInputValue(from);
  const end = parseDateInputValue(to);
  if (start === null || end === null) return null;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86_400_000) + 1;
}

export function estimateTrendGranularity(from: string, to: string): ReportTrendGranularity {
  const days = daysBetweenInclusive(from, to) ?? 0;
  if (days <= trendAutoGranularity.dayMaxDays) return "day";
  if (days <= trendAutoGranularity.weekMaxDays) return "week";
  return "month";
}

/** Granularities the backend accepts for this range (month is capped by a setting). */
export function allowedTrendGranularities(from: string, to: string): readonly ReportTrendGranularity[] {
  const days = daysBetweenInclusive(from, to);
  if (days === null || days < 1) return ["month"];
  const allowed: ReportTrendGranularity[] = [];
  if (days <= trendBucketLimits.day) allowed.push("day");
  if (Math.ceil(days / 7) + 1 <= trendBucketLimits.week) allowed.push("week");
  allowed.push("month");
  return allowed;
}

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function isDate(value: string | null): value is string {
  return value !== null && parseDateInputValue(value) !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * A named preset wins (re-resolved against today); otherwise explicit
 * `from`/`to` make a custom range; otherwise the default is 12 months.
 */
export function parseTrendsSearch(params: URLSearchParams, now: Date): TrendsViewState {
  const from = params.get("from");
  const to = params.get("to");
  const namedPreset = pick(params.get("preset"), trendPresets);
  const presetRange =
    namedPreset !== null && namedPreset !== "custom" ? resolveTrendPresetRange(namedPreset, now) : null;
  const explicit = isDate(from) && isDate(to) && from <= to;
  const [preset, range]: [TrendPreset, { from: string; to: string }] =
    presetRange !== null && namedPreset !== null
      ? [namedPreset, presetRange]
      : explicit
        ? ["custom", { from, to }]
        : ["12m", resolveTrendPresetRange("12m", now) as { from: string; to: string }];
  const text = (key: string) => {
    const value = params.get(key);
    return value !== null && value.length > 0 && value.length <= 64 ? value : null;
  };
  return {
    preset,
    from: range.from,
    to: range.to,
    granularity: pick(params.get("granularity"), reportTrendGranularities),
    organizationalUnitId: text("organizationalUnitId"),
    serviceId: text("serviceId"),
    groupId: text("groupId"),
    priority: pick(params.get("priority"), reportTrendPriorities),
  };
}

/** Only non-default values go to the URL; presets are re-resolved on load. */
export function toTrendsSearch(state: TrendsViewState): URLSearchParams {
  const params = new URLSearchParams({ tab: "trends" });
  if (state.preset === "custom") {
    params.set("from", state.from);
    params.set("to", state.to);
  } else if (state.preset !== "12m") {
    params.set("preset", state.preset);
  }
  if (state.granularity !== null) params.set("granularity", state.granularity);
  if (state.organizationalUnitId !== null) params.set("organizationalUnitId", state.organizationalUnitId);
  if (state.serviceId !== null) params.set("serviceId", state.serviceId);
  if (state.groupId !== null) params.set("groupId", state.groupId);
  if (state.priority !== null) params.set("priority", state.priority);
  return params;
}

export function toTrendsQuery(state: TrendsViewState, organizationalUnitId: string): ReportTrendsQuery {
  return {
    organizationalUnitId,
    from: state.from,
    to: state.to,
    ...(state.granularity === null ? {} : { granularity: state.granularity }),
    ...(state.serviceId === null ? {} : { serviceId: state.serviceId }),
    ...(state.groupId === null ? {} : { groupId: state.groupId }),
    ...(state.priority === null ? {} : { priority: state.priority }),
  };
}

/** Bosnian month names — fallback for runtimes with trimmed ICU data (they render `M09`). */
const bsMonthsShort = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const bsMonthsLong = ["januar", "februar", "mart", "april", "maj", "juni", "juli", "august", "septembar", "oktobar", "novembar", "decembar"];

function monthName(date: Date, locale: string, style: "short" | "long"): string {
  const formatted = new Intl.DateTimeFormat(locale, { month: style }).format(date).replace(/\.$/, "");
  if (locale.startsWith("bs") && /^M?\d+$/.test(formatted)) {
    return (style === "short" ? bsMonthsShort : bsMonthsLong)[date.getMonth()] ?? formatted;
  }
  return formatted;
}

function civil(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Axis label: `27.09.` (day, week start) or `sep 26` (month). */
export function formatTrendBucketShort(key: string, granularity: ReportTrendGranularity, locale: string): string {
  const date = civil(key);
  if (granularity === "month") {
    const month = monthName(date, locale, "short");
    return `${month} ${String(date.getFullYear()).slice(2)}`;
  }
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
}

/** Tooltip/table label: `27.09.2026.`, `22.03. – 28.03.2026.` or `septembar 2026.` */
export function formatTrendBucketLong(key: string, granularity: ReportTrendGranularity, locale: string): string {
  const date = civil(key);
  const dotted = (value: Date, withYear: boolean) =>
    `${String(value.getDate()).padStart(2, "0")}.${String(value.getMonth() + 1).padStart(2, "0")}.${withYear ? `${value.getFullYear()}.` : ""}`;
  if (granularity === "day") return dotted(date, true);
  if (granularity === "week") {
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6);
    return `${dotted(date, date.getFullYear() !== end.getFullYear())} – ${dotted(end, true)}`;
  }
  if (locale.startsWith("bs")) return `${monthName(date, locale, "long")} ${date.getFullYear()}.`;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

/** Hours for display: `45 min`, `3,5 h`, `2,1 d` (locale decimal separator). */
export function formatTrendHours(hours: number | null, locale: string): string {
  if (hours === null) return "—";
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value);
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${number(hours)} h`;
  return `${number(hours / 24)} d`;
}

export function formatTrendPercent(value: number | null, locale: string): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} %`;
}

export const reportTrendErrorCodes = [
  "REPORT_WINDOW_INVALID",
  "REPORT_GRANULARITY_INVALID",
  "REPORT_TRENDS_DISABLED",
  "REPORTS_DISABLED",
  /** Val 1 (M15/B2): usko grlo je isključeno postavkom, nije greška u radu. */
  "BOTTLENECKS_DISABLED",
  "REPORT_ORGANIZATIONAL_UNIT_NOT_FOUND",
  "REPORT_FORMAT_NOT_ALLOWED",
  "REPORT_SCHEDULE_DISABLED",
  "REPORT_SCHEDULE_NOT_FOUND",
  "REPORT_SCHEDULE_LIMIT",
  "REPORT_SCHEDULE_INVALID",
  "REPORT_RECIPIENT_INVALID",
  "REPORT_RECIPIENT_LIMIT",
] as const;
export type ReportTrendErrorCode = (typeof reportTrendErrorCodes)[number];

/** Domain codes get their own message; everything else falls back to the shared map. */
export function readReportErrorCode(error: unknown): ReportTrendErrorCode | null {
  if (!(error instanceof ApiError)) return null;
  return (reportTrendErrorCodes as readonly string[]).includes(error.code)
    ? (error.code as ReportTrendErrorCode)
    : null;
}
