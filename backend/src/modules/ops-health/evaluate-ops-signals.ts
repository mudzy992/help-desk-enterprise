import { opsAlertKeys, type OpsAlertKey, type OpsAlertSeverity } from './ops-alert-catalog';

/**
 * Paket 2.7 (§4): turns one measurement round into one observation per alarm
 * key. Pure: no clock, no I/O - the collector gathers the numbers, the engine
 * applies hysteresis and persistence. Details carry numbers and technical
 * identifiers only, never personal data.
 */
export type OpsThresholds = {
  readonly diskWarnPercent: number;
  readonly diskCriticalPercent: number;
  readonly http5xxMinCount: number;
  readonly http5xxMinPercent: number;
  readonly slaScanLateMinutes: number;
  readonly workerHeartbeatStaleSeconds: number;
  readonly clamavFailuresBeforeAlert: number;
  // Package 5.2.3 (M11 B3): per-minute WebSocket emit alarm (any room kind).
  readonly websocketEmitWarnPerMinute: number;
  readonly websocketEmitCriticalPerMinute: number;
};

export type SchedulerSignal = {
  readonly queue: string;
  readonly schedulerId: string;
  readonly everyMs: number | null;
  readonly pattern: string | null;
  /** When BullMQ expects the next run; stays in the past while nobody picks it up. */
  readonly nextMs: number | null;
  readonly lastSuccessMs: number | null;
  readonly lastFailureMs: number | null;
};

export type QueueSignal = {
  readonly queue: string;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly failed: number;
};

export type OpsSignals = {
  readonly nowMs: number;
  readonly database: 'ok' | 'fail';
  readonly redis: 'ok' | 'fail';
  readonly disk: { readonly usedPercent: number; readonly freeBytes: number; readonly totalBytes: number } | null;
  readonly clamav: { readonly configured: false } | { readonly configured: true; readonly ok: boolean; readonly failOpen: boolean };
  /** Null when Redis could not be read (the redis alarm covers that). */
  readonly schedulers: readonly SchedulerSignal[] | null;
  readonly queues: readonly QueueSignal[] | null;
  /** `IntegrationJob` rows in DLQ; null when the database could not be read. */
  readonly integrationDlq: number | null;
  /** Totals of the last five complete minutes; null when unknown. */
  readonly http: { readonly errors5xx: number; readonly total: number } | null;
  /** Worst per-instance mean event-loop delay of the last minute, ms. */
  readonly eventLoopLagMs: number | null;
  readonly ldapsCaExpiresAtMs: number | null;
  /**
   * Package 5.2.3 (M11 B3): WebSocket emit totals per room kind for the last
   * complete minute, aggregated across every API instance. `null` when Redis
   * could not be read, or when no API instance wrote a heartbeat in that
   * minute (which would make the zeros misleading).
   */
  readonly websocketEmits: Record<string, number> | null;
};

/** Acknowledged DLQ state (§4.2): an alarm fires on growth above it only. */
export type DlqBaseline = {
  readonly integrationDlq: number;
  readonly failedByQueue: Readonly<Record<string, number>>;
};

export type OpsObservation = {
  readonly key: OpsAlertKey;
  readonly active: boolean;
  readonly severity: OpsAlertSeverity;
  readonly details: Readonly<Record<string, unknown>>;
  /** Overrides the catalog `openAfter` (ClamAV uses the configurable streak). */
  readonly openAfter?: number;
};

export const slaScanQueue = 'sla-scan';
export const eventLoopLagThresholdsMs = { warning: 500, critical: 2_000 } as const;
export const ldapsCaExpiryDays = { warning: 30, critical: 7 } as const;
const minute = 60_000;
const day = 86_400_000;

export function evaluateOpsSignals(
  signals: OpsSignals,
  thresholds: OpsThresholds,
  baseline: DlqBaseline | null,
): OpsObservation[] {
  return [
    observeDatabase(signals),
    observeRedis(signals),
    observeDisk(signals, thresholds),
    observeClamav(signals, thresholds),
    observeSlaScan(signals, thresholds),
    observeSchedulers(signals),
    observeDlq(signals, baseline),
    observeHttp(signals, thresholds),
    observeEventLoop(signals),
    observeLdapsCa(signals),
    observeWebsocketEmits(signals, thresholds),
  ];
}

function inactive(key: OpsAlertKey): OpsObservation {
  return { key, active: false, severity: 'WARNING', details: {} };
}

function observeDatabase(signals: OpsSignals): OpsObservation {
  return signals.database === 'fail'
    ? { key: opsAlertKeys.databaseUnavailable, active: true, severity: 'CRITICAL', details: {} }
    : inactive(opsAlertKeys.databaseUnavailable);
}

function observeRedis(signals: OpsSignals): OpsObservation {
  return signals.redis === 'fail'
    ? { key: opsAlertKeys.redisUnavailable, active: true, severity: 'CRITICAL', details: {} }
    : inactive(opsAlertKeys.redisUnavailable);
}

function observeDisk(signals: OpsSignals, thresholds: OpsThresholds): OpsObservation {
  const disk = signals.disk;
  if (disk === null || disk.usedPercent < thresholds.diskWarnPercent) return inactive(opsAlertKeys.diskUsage);
  return {
    key: opsAlertKeys.diskUsage,
    active: true,
    severity: disk.usedPercent >= thresholds.diskCriticalPercent ? 'CRITICAL' : 'WARNING',
    details: {
      usedPercent: round1(disk.usedPercent),
      freeGb: round1(disk.freeBytes / 1024 ** 3),
      totalGb: round1(disk.totalBytes / 1024 ** 3),
    },
  };
}

function observeClamav(signals: OpsSignals, thresholds: OpsThresholds): OpsObservation {
  const clamav = signals.clamav;
  if (!clamav.configured || clamav.ok) return inactive(opsAlertKeys.clamavUnavailable);
  return {
    key: opsAlertKeys.clamavUnavailable,
    active: true,
    // Fail-closed blocks every upload; fail-open lets files through unscanned.
    severity: clamav.failOpen ? 'WARNING' : 'CRITICAL',
    details: { failOpen: clamav.failOpen },
    openAfter: thresholds.clamavFailuresBeforeAlert,
  };
}

function observeSlaScan(signals: OpsSignals, thresholds: OpsThresholds): OpsObservation {
  const scan = signals.schedulers?.find((entry) => entry.queue === slaScanQueue);
  if (scan === undefined) return inactive(opsAlertKeys.slaScanLate);
  const limitMs = thresholds.slaScanLateMinutes * minute;
  const sinceSuccess = scan.lastSuccessMs === null ? null : signals.nowMs - scan.lastSuccessMs;
  const overdue = scan.nextMs === null ? 0 : signals.nowMs - scan.nextMs;
  // A fresh install has no completed scan yet: only an overdue schedule counts.
  const late = (sinceSuccess !== null && sinceSuccess > limitMs) || overdue > limitMs;
  if (!late) return inactive(opsAlertKeys.slaScanLate);
  return {
    key: opsAlertKeys.slaScanLate,
    active: true,
    severity: 'CRITICAL',
    details: {
      minutesSinceSuccess: sinceSuccess === null ? null : Math.floor(sinceSuccess / minute),
      thresholdMinutes: thresholds.slaScanLateMinutes,
    },
  };
}

/** Grace before a scheduled run counts as late (§4.1). */
export function schedulerGraceMs(scheduler: Pick<SchedulerSignal, 'everyMs'>): number {
  return scheduler.everyMs === null ? 15 * minute : Math.max(3 * scheduler.everyMs, 3 * minute);
}

export function findLateSchedulers(signals: Pick<OpsSignals, 'nowMs' | 'schedulers'>): Array<{
  readonly queue: string;
  readonly schedulerId: string;
  readonly reason: 'not_picked_up' | 'failing';
  readonly minutesLate: number;
}> {
  const late: Array<{ queue: string; schedulerId: string; reason: 'not_picked_up' | 'failing'; minutesLate: number }> = [];
  for (const scheduler of signals.schedulers ?? []) {
    if (scheduler.queue === slaScanQueue) continue;
    const grace = schedulerGraceMs(scheduler);
    if (scheduler.nextMs !== null && signals.nowMs - scheduler.nextMs > grace) {
      late.push({
        queue: scheduler.queue,
        schedulerId: scheduler.schedulerId,
        reason: 'not_picked_up',
        minutesLate: Math.floor((signals.nowMs - scheduler.nextMs) / minute),
      });
      continue;
    }
    // Runs happen but keep failing: the last outcome is a failure and the last
    // success (if any) is older than the grace.
    if (
      scheduler.everyMs !== null &&
      scheduler.lastFailureMs !== null &&
      (scheduler.lastSuccessMs === null || scheduler.lastFailureMs > scheduler.lastSuccessMs) &&
      (scheduler.lastSuccessMs === null || signals.nowMs - scheduler.lastSuccessMs > Math.max(grace, 10 * minute))
    ) {
      late.push({
        queue: scheduler.queue,
        schedulerId: scheduler.schedulerId,
        reason: 'failing',
        minutesLate: scheduler.lastSuccessMs === null ? 0 : Math.floor((signals.nowMs - scheduler.lastSuccessMs) / minute),
      });
    }
  }
  return late.sort((a, b) => a.queue.localeCompare(b.queue) || a.schedulerId.localeCompare(b.schedulerId));
}

function observeSchedulers(signals: OpsSignals): OpsObservation {
  const late = findLateSchedulers(signals);
  if (late.length === 0) return inactive(opsAlertKeys.schedulerLate);
  return { key: opsAlertKeys.schedulerLate, active: true, severity: 'WARNING', details: { jobs: late } };
}

/** New failures above the acknowledged baseline, per source (§4.2). */
export function dlqGrowth(
  signals: Pick<OpsSignals, 'integrationDlq' | 'queues'>,
  baseline: DlqBaseline | null,
): { readonly integrationDlq: number; readonly failedByQueue: Record<string, number> } {
  const failedByQueue: Record<string, number> = {};
  for (const queue of signals.queues ?? []) {
    const grown = queue.failed - (baseline?.failedByQueue[queue.queue] ?? 0);
    if (grown > 0) failedByQueue[queue.queue] = grown;
  }
  const integrationDlq =
    signals.integrationDlq === null ? 0 : Math.max(0, signals.integrationDlq - (baseline?.integrationDlq ?? 0));
  return { integrationDlq, failedByQueue };
}

/**
 * Failed-job counts shrink when BullMQ trims old failures (`removeOnFail`).
 * The baseline follows them down, otherwise new failures would hide under the
 * old count; it only moves up when an operator acknowledges.
 */
export function lowerDlqBaseline(
  signals: Pick<OpsSignals, 'integrationDlq' | 'queues'>,
  baseline: DlqBaseline,
): DlqBaseline | null {
  let changed = false;
  const failedByQueue: Record<string, number> = { ...baseline.failedByQueue };
  for (const queue of signals.queues ?? []) {
    const known = failedByQueue[queue.queue];
    if (known !== undefined && queue.failed < known) {
      failedByQueue[queue.queue] = queue.failed;
      changed = true;
    }
  }
  let integrationDlq = baseline.integrationDlq;
  if (signals.integrationDlq !== null && signals.integrationDlq < integrationDlq) {
    integrationDlq = signals.integrationDlq;
    changed = true;
  }
  return changed ? { integrationDlq, failedByQueue } : null;
}

function observeDlq(signals: OpsSignals, baseline: DlqBaseline | null): OpsObservation {
  const growth = dlqGrowth(signals, baseline);
  const total = growth.integrationDlq + Object.values(growth.failedByQueue).reduce((sum, value) => sum + value, 0);
  if (total === 0) return inactive(opsAlertKeys.queueDlq);
  return {
    key: opsAlertKeys.queueDlq,
    active: true,
    severity: 'WARNING',
    details: { newFailures: total, integrationDlq: growth.integrationDlq, failedByQueue: growth.failedByQueue },
  };
}

function observeHttp(signals: OpsSignals, thresholds: OpsThresholds): OpsObservation {
  const http = signals.http;
  if (http === null || http.total === 0) return inactive(opsAlertKeys.http5xx);
  const percent = (http.errors5xx / http.total) * 100;
  if (http.errors5xx < thresholds.http5xxMinCount || percent < thresholds.http5xxMinPercent) {
    return inactive(opsAlertKeys.http5xx);
  }
  const critical =
    http.errors5xx >= thresholds.http5xxMinCount * 2 && percent >= Math.min(100, thresholds.http5xxMinPercent * 5);
  return {
    key: opsAlertKeys.http5xx,
    active: true,
    severity: critical ? 'CRITICAL' : 'WARNING',
    details: { errors5xx: http.errors5xx, total: http.total, percent: round1(percent), windowMinutes: 5 },
  };
}

function observeEventLoop(signals: OpsSignals): OpsObservation {
  const lag = signals.eventLoopLagMs;
  if (lag === null || lag <= eventLoopLagThresholdsMs.warning) return inactive(opsAlertKeys.apiEventLoopLag);
  return {
    key: opsAlertKeys.apiEventLoopLag,
    active: true,
    severity: lag > eventLoopLagThresholdsMs.critical ? 'CRITICAL' : 'WARNING',
    details: { meanLagMs: Math.round(lag) },
  };
}

function observeLdapsCa(signals: OpsSignals): OpsObservation {
  if (signals.ldapsCaExpiresAtMs === null) return inactive(opsAlertKeys.ldapsCaExpiry);
  const daysLeft = Math.floor((signals.ldapsCaExpiresAtMs - signals.nowMs) / day);
  if (daysLeft > ldapsCaExpiryDays.warning) return inactive(opsAlertKeys.ldapsCaExpiry);
  return {
    key: opsAlertKeys.ldapsCaExpiry,
    active: true,
    severity: daysLeft <= ldapsCaExpiryDays.critical ? 'CRITICAL' : 'WARNING',
    details: { daysLeft, expiresAt: new Date(signals.ldapsCaExpiresAtMs).toISOString() },
  };
}

/**
 * M11 B3: aggregate emits/min per room kind across every API instance. The
 * critical/warning thresholds apply to the busiest room kind (the legacy
 * full-payload room is expected to dominate when enabled). openAfter=2
 * minutes guards against transient flurries (client reconnects after a
 * deploy); resolveAfter=2 minutes protects from a single quiet sample
 * (hysteresis).
 */
function observeWebsocketEmits(signals: OpsSignals, thresholds: OpsThresholds): OpsObservation {
  const rooms = signals.websocketEmits;
  if (rooms === null) return inactive(opsAlertKeys.websocketEmitsHigh);
  let busiestRoom = '';
  let busiestCount = 0;
  for (const [kind, count] of Object.entries(rooms)) {
    if (count > busiestCount) {
      busiestCount = count;
      busiestRoom = kind;
    }
  }
  if (busiestCount < thresholds.websocketEmitWarnPerMinute) {
    return inactive(opsAlertKeys.websocketEmitsHigh);
  }
  const severity: OpsAlertSeverity = busiestCount >= thresholds.websocketEmitCriticalPerMinute ? 'CRITICAL' : 'WARNING';
  return {
    key: opsAlertKeys.websocketEmitsHigh,
    active: true,
    severity,
    details: {
      emitsPerMinute: busiestCount,
      busiestRoom,
      perRoom: rooms,
      warnThreshold: thresholds.websocketEmitWarnPerMinute,
      criticalThreshold: thresholds.websocketEmitCriticalPerMinute,
    },
    openAfter: 2,
  };
}

/** Worker heartbeat, checked by the API watchdog (§5.2). */
export function observeWorkerHeartbeat(input: {
  readonly lastHeartbeatAt: string | null;
  readonly nowMs: number;
  readonly staleSeconds: number;
}): OpsObservation {
  const at = input.lastHeartbeatAt === null ? Number.NaN : Date.parse(input.lastHeartbeatAt);
  const ageSeconds = Number.isNaN(at) ? null : Math.max(0, Math.round((input.nowMs - at) / 1000));
  if (ageSeconds !== null && ageSeconds <= input.staleSeconds) return inactive(opsAlertKeys.workerDown);
  return {
    key: opsAlertKeys.workerDown,
    active: true,
    severity: 'CRITICAL',
    details: { heartbeatAgeSeconds: ageSeconds, thresholdSeconds: input.staleSeconds },
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The worker is alive but its health loop is not (§5.2): checked by the API
 * watchdog next to the heartbeat, otherwise a stuck `ops-health` queue would
 * silence every other alarm.
 */
export function observeMonitorFreshness(input: {
  readonly workerAlive: boolean;
  readonly snapshotGeneratedAt: string | null;
  readonly nowMs: number;
  readonly staleSeconds: number;
}): OpsObservation {
  if (!input.workerAlive) return inactive(opsAlertKeys.opsMonitorStale);
  const at = input.snapshotGeneratedAt === null ? Number.NaN : Date.parse(input.snapshotGeneratedAt);
  const ageSeconds = Number.isNaN(at) ? null : Math.max(0, Math.round((input.nowMs - at) / 1000));
  if (ageSeconds !== null && ageSeconds <= input.staleSeconds) return inactive(opsAlertKeys.opsMonitorStale);
  return {
    key: opsAlertKeys.opsMonitorStale,
    active: true,
    severity: 'WARNING',
    details: { snapshotAgeSeconds: ageSeconds, thresholdSeconds: input.staleSeconds },
  };
}
