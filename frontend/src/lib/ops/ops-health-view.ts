import type { BadgeTone } from "@/components/ui/badge";
import type { OpsAlert, OpsOverview } from "@/services/ops-health-api";

/**
 * Paket 2.7 (§6): pure view helpers of the "System health" card. No I/O and
 * no clock of their own - `nowMs` is passed in, so everything is testable.
 */

/** Alarm keys known to this client, as i18n slugs (i18next splits on dots). */
export const opsAlertSlugs = [
  "worker_down",
  "sla_scan_late",
  "scheduler_late",
  "disk_usage",
  "clamav_unavailable",
  "queue_dlq",
  "http_5xx",
  "database_unavailable",
  "redis_unavailable",
  "api_eventloop_lag",
  "tls_ldapsCa_expiry",
  "ops_monitor_stale",
  "ops_test",
] as const;
export type OpsAlertSlug = (typeof opsAlertSlugs)[number];

export function opsAlertSlug(key: string): OpsAlertSlug | null {
  const slug = key.replace(/\./g, "_");
  return (opsAlertSlugs as readonly string[]).includes(slug) ? (slug as OpsAlertSlug) : null;
}

/** The worker writes a snapshot every minute; older than this = monitor stale. */
export const opsSnapshotStaleSeconds = 180;

export type OpsOverallState = "ok" | "degraded" | "down";

/**
 * One word for the card header. "down" = something users feel right now
 * (critical alarm, database, Redis or worker); "degraded" = warnings or a
 * monitor that cannot be trusted at the moment.
 */
export function overallOpsState(overview: OpsOverview): OpsOverallState {
  const { components } = overview;
  if (
    components.database === "fail" ||
    components.redis === "fail" ||
    components.worker.status === "stale" ||
    overview.alerts.some((alert) => alert.severity === "CRITICAL")
  ) {
    return "down";
  }
  const snapshotStale =
    overview.snapshot === null ||
    overview.snapshot.ageSeconds === null ||
    overview.snapshot.ageSeconds > opsSnapshotStaleSeconds;
  if (overview.alerts.length > 0 || snapshotStale || components.worker.status === "unknown") {
    return "degraded";
  }
  return "ok";
}

export const overallStateTone: Record<OpsOverallState, BadgeTone> = {
  ok: "success",
  degraded: "warning",
  down: "danger",
};

export function severityTone(alert: Pick<OpsAlert, "severity" | "status">): BadgeTone {
  if (alert.status === "RESOLVED") return "success";
  return alert.severity === "CRITICAL" ? "danger" : "warning";
}

export type ComponentState = "ok" | "warning" | "fail" | "unknown" | "off";

export const componentStateTone: Record<ComponentState, BadgeTone> = {
  ok: "success",
  warning: "warning",
  fail: "danger",
  unknown: "neutral",
  off: "neutral",
};

export function diskState(
  disk: OpsOverview["components"]["disk"],
  thresholds: OpsOverview["configuration"]["thresholds"],
): ComponentState {
  if (disk === null) return "unknown";
  if (disk.usedPercent >= thresholds.diskCriticalPercent) return "fail";
  if (disk.usedPercent >= thresholds.diskWarnPercent) return "warning";
  return "ok";
}

export function clamavState(clamav: OpsOverview["components"]["clamav"]): ComponentState {
  if (clamav === null) return "unknown";
  if (!clamav.configured) return "off";
  if (clamav.ok) return "ok";
  return clamav.failOpen ? "warning" : "fail";
}

/** Mirrors `eventLoopLagThresholdsMs` in the backend evaluator. */
export const eventLoopLagThresholdsMs = { warning: 500, critical: 2_000 } as const;

export function eventLoopState(lagMs: number | null): ComponentState {
  if (lagMs === null) return "unknown";
  if (lagMs > eventLoopLagThresholdsMs.critical) return "fail";
  if (lagMs > eventLoopLagThresholdsMs.warning) return "warning";
  return "ok";
}

/** Mirrors `ldapsCaExpiryDays` (30 / 7) in the backend evaluator. */
export function ldapsCaState(expiresAt: string | null, nowMs: number): { state: ComponentState; daysLeft: number | null } {
  if (expiresAt === null) return { state: "off", daysLeft: null };
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return { state: "unknown", daysLeft: null };
  const daysLeft = Math.floor((at - nowMs) / 86_400_000);
  if (daysLeft <= 7) return { state: "fail", daysLeft };
  if (daysLeft <= 30) return { state: "warning", daysLeft };
  return { state: "ok", daysLeft };
}

export function inboundState(mailbox: OpsOverview["components"]["inbound"][number]): ComponentState {
  if (mailbox.consecutiveFails >= 3) return "fail";
  if (mailbox.consecutiveFails > 0) return "warning";
  return mailbox.lastSuccessAt === null ? "unknown" : "ok";
}

/** "45 s", "12 min", "3 h 5 min", "4 d 2 h" - units read the same in bs and en. */
export function formatOpsDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${totalHours} h` : `${totalHours} h ${minutes} min`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/** How long an alarm has been (or was) active. */
export function alertDurationMs(alert: Pick<OpsAlert, "firstSeenAt" | "resolvedAt">, nowMs: number): number {
  const start = Date.parse(alert.firstSeenAt);
  const end = alert.resolvedAt === null ? nowMs : Date.parse(alert.resolvedAt);
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, end - start);
}

/**
 * Alarm details are numbers and technical identifiers only (no personal
 * data, see the backend evaluator). Flattened to "label: value" pairs.
 */
export function alertDetailEntries(details: OpsAlert["details"]): ReadonlyArray<readonly [string, string]> {
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

export type HttpBar = { readonly at: string; readonly errors5xx: number; readonly total: number; readonly heightPercent: number };

/** Bars of the 5xx mini chart; heights relative to the busiest minute (min 1 so the axis stays readable). */
export function httpBars(series: OpsOverview["http"]["series"]): { bars: readonly HttpBar[]; max: number; totalErrors: number } {
  const max = Math.max(1, ...series.map((entry) => entry.errors5xx));
  return {
    max,
    totalErrors: series.reduce((sum, entry) => sum + entry.errors5xx, 0),
    bars: series.map((entry) => ({ ...entry, heightPercent: Math.round((entry.errors5xx / max) * 100) })),
  };
}

/** Failed jobs above the last acknowledged baseline, per queue and in total. */
export function dlqGrowthTotal(dlq: OpsOverview["dlq"]): number {
  if (dlq.growth === null) return 0;
  return dlq.growth.integrationDlq + Object.values(dlq.growth.failedByQueue).reduce((sum, value) => sum + value, 0);
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
