import type { TranslationKey } from "@/i18n/translation-key";
import type { OpsAlert, OpsOverview } from "@/services/ops-health-api";

/**
 * Detail fields of an alarm, as i18n slugs. The card used to print the raw
 * field names (`warnThreshold: 50`), which is what the live review of the 429
 * alarm showed. Everything the backend observers can put into `details` has a
 * label here; the order is the reading order — the measured number first, the
 * thresholds and the window after it.
 */
export const alertDetailFieldSlugs = [
  "usedPercent",
  "emitsPerMinute",
  "busiestRoom",
  "login429LastHour",
  "captchaFailedLastHour",
  "captchaSkippedLastHour",
  // the audit webhook streak and its fixed thresholds.
  "auditWebhookPendingMinutes",
  "warnAfterMinutes",
  "criticalAfterMinutes",
  "errors5xx",
  "minutesSinceSuccess",
  "meanLagMs",
  "daysLeft",
  "heartbeatAgeSeconds",
  "snapshotAgeSeconds",
  // Incident 2026-10-16: absence of a key is reported as its own fact, and the
  // mail breaker says how long sending is paused and what it held back.
  "heartbeatMissing",
  "snapshotMissing",
  "blockedMinutesLeft",
  "suppressedTotal",
  "newFailures",
  "integrationDlq",
  "jobs",
  "perRoom",
  "failedByQueue",
  "total",
  "percent",
  "freeGb",
  "totalGb",
  "failOpen",
  "thresholdSeconds",
  "thresholdMinutes",
  "windowMinutes",
  "warnThreshold",
  "criticalThreshold",
  "expiresAt",
] as const;

export type AlertDetailFieldSlug = (typeof alertDetailFieldSlugs)[number];

/** The label key for a detail field; `null` for a field this client does not know. */
export function alertDetailLabelKey(field: string): TranslationKey | null {
  return (alertDetailFieldSlugs as readonly string[]).includes(field)
    ? (`admin.opsHealth.alertDetailLabels.${field}` as TranslationKey)
    : null;
}

/**
 * Reading order of the detail rows: the measured value first, then the
 * thresholds it is compared against. Unknown fields keep their relative order
 * and go last, so a future field never pushes the number out of sight.
 */
export function sortAlertDetailEntries(
  entries: ReadonlyArray<readonly [string, string]>,
): Array<readonly [string, string]> {
  const rank = (label: string): number => {
    const index = (alertDetailFieldSlugs as readonly string[]).indexOf(
      label.split(".")[0] ?? label,
    );
    return index === -1 ? alertDetailFieldSlugs.length : index;
  };
  return [...entries].sort((left, right) => rank(left[0]) - rank(right[0]));
}

export function alertDetailEntries(
  details: OpsAlert["details"],
): ReadonlyArray<readonly [string, string]> {
  if (details === null || typeof details !== "object") return [];
  const entries: Array<readonly [string, string]> = [];
  const visit = (prefix: string, value: unknown, depth: number) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      const text = value
        .map((item) =>
          item !== null && typeof item === "object"
            ? Object.values(item as Record<string, unknown>)
                .filter((part) => typeof part === "string" || typeof part === "number")
                .join("/")
            : String(item),
        )
        .filter((item) => item.length > 0)
        .join(", ");
      if (text.length > 0) entries.push([prefix, text]);
      return;
    }
    if (typeof value === "object") {
      if (depth >= 2) return;
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        visit(prefix.length === 0 ? key : `${prefix}.${key}`, nested, depth + 1);
      }
      return;
    }
    entries.push([prefix, String(value)]);
  };
  visit("", details, 0);
  return entries;
}

export type HttpBar = {
  readonly at: string;
  readonly errors5xx: number;
  readonly total: number;
  readonly heightPercent: number;
};

/** Bars of the 5xx mini chart; heights relative to the busiest minute (min 1 so the axis stays readable). */
export function httpBars(series: OpsOverview["http"]["series"]): {
  bars: readonly HttpBar[];
  max: number;
  totalErrors: number;
} {
  const max = Math.max(1, ...series.map((entry) => entry.errors5xx));
  return {
    max,
    totalErrors: series.reduce((sum, entry) => sum + entry.errors5xx, 0),
    bars: series.map((entry) => ({
      ...entry,
      heightPercent: Math.round((entry.errors5xx / max) * 100),
    })),
  };
}

/** Failed jobs above the last acknowledged baseline, per queue and in total. */
export function dlqGrowthTotal(dlq: OpsOverview["dlq"]): number {
  if (dlq.growth === null) return 0;
  return (
    dlq.growth.integrationDlq +
    Object.values(dlq.growth.failedByQueue).reduce((sum, value) => sum + value, 0)
  );
}

export function sortSchedulers(schedulers: OpsOverview["schedulers"]): OpsOverview["schedulers"] {
  return [...schedulers].sort((left, right) =>
    left.state === right.state
      ? `${left.queue}/${left.schedulerId}`.localeCompare(`${right.queue}/${right.schedulerId}`)
      : left.state === "late"
        ? -1
        : 1,
  );
}
