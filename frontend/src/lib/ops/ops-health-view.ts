import type { BadgeTone } from "@/lib/ui/presentation-types";
import type { OpsAlert, OpsOverview } from "@/services/ops-health-api";

/**
 * pure view helpers of the "System health" card. No I/O and
 * no clock of their own - `nowMs` is passed in, so everything is testable.
 */

/** Alarm keys known to this client, as i18n slugs (i18next splits on dots). */
export const opsAlertSlugs = [
  "worker_down",
  // Incident 2026-10-16: the provider (Gmail) refused sending, so outbound mail
  // is paused by the breaker. Without the slug the card printed the raw key.
  "email_providerBlocked",
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
  // Package 5.2.3 (WebSocket emits) and the 5.4.0-f follow-up (login 429s):
  // without these two the card showed the raw key (`auth.login429.high`) as the
  // alert title instead of the translated one.
  "websocket_emits_high",
  "auth_login429_high",
  // the captcha alarms (refused challenges, skipped checks).
  "auth_captchaFailed_high",
  "auth_captchaSkipped_high",
  // the audit webhook export has not delivered for a streak.
  "security_auditWebhook_stalled",
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
export function ldapsCaState(
  expiresAt: string | null,
  nowMs: number,
): { state: ComponentState; daysLeft: number | null } {
  if (expiresAt === null) return { state: "off", daysLeft: null };
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return { state: "unknown", daysLeft: null };
  const daysLeft = Math.floor((at - nowMs) / 86_400_000);
  if (daysLeft <= 7) return { state: "fail", daysLeft };
  if (daysLeft <= 30) return { state: "warning", daysLeft };
  return { state: "ok", daysLeft };
}

export function inboundState(
  mailbox: OpsOverview["components"]["inbound"][number],
): ComponentState {
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
export function alertDurationMs(
  alert: Pick<OpsAlert, "firstSeenAt" | "resolvedAt">,
  nowMs: number,
): number {
  const start = Date.parse(alert.firstSeenAt);
  const end = alert.resolvedAt === null ? nowMs : Date.parse(alert.resolvedAt);
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, end - start);
}

/**
 * Alarm details are numbers and technical identifiers only (no personal
 * data, see the backend evaluator). Flattened to "label: value" pairs.
 */
export * from "@/lib/ops/ops-health-details";
