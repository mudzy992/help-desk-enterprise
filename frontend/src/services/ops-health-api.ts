import { apiRequest } from "@/services/api";

/**
 * Paket 2.7 (§6): `/ops/*`. Types mirror `OpsHealthService`
 * (`backend/src/modules/ops-health/ops-health.service.ts`). Reading and
 * acknowledging need `ops.health.view`; silencing, the test alarm and the DLQ
 * baseline need `ops.alerts.manage`.
 */

export type ProbeState = "ok" | "fail";
export type OpsAlertSeverity = "WARNING" | "CRITICAL";
export type OpsAlertStatus = "FIRING" | "ACKNOWLEDGED" | "RESOLVED";

export type OpsAlert = {
  readonly id: string;
  readonly key: string;
  readonly severity: OpsAlertSeverity;
  readonly status: OpsAlertStatus;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly resolvedAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly acknowledgedBy: string | null;
  readonly notifyCount: number;
  readonly runbook: string | null;
};

export type ChangeDowntimeSyncHealth = {
  readonly status: "ok" | "degraded";
  readonly pending: number;
  readonly processing: number;
  readonly deadLetter: number;
  readonly oldestPendingAgeMs: number;
};

export type TicketSideEffectOutboxHealth = {
  readonly status: "ok" | "degraded";
  readonly pending: number;
  readonly processing: number;
  readonly deadLetter: number;
  readonly oldestPendingAgeMs: number;
};

export type NotificationFanOutOutboxHealth = TicketSideEffectOutboxHealth;

export type TemplatesConfigurationHealth = {
  readonly status: "ok" | "degraded";
  readonly readFailuresTotal: number;
  readonly lastFailureAt: string | null;
  readonly lastRecoveryAt: string | null;
};

export type OpsClamavState =
  | { readonly configured: false }
  | { readonly configured: true; readonly ok: boolean; readonly failOpen: boolean };

export type OpsScheduler = {
  readonly queue: string;
  readonly schedulerId: string;
  readonly everyMs: number | null;
  readonly pattern: string | null;
  readonly nextAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly graceMs: number;
  /** false means an expected asset scheduler is absent from Redis. */
  readonly registered: boolean;
  /** Asset-specific stale-success alarm limit; null for schedules without one. */
  readonly lastSuccessMaxAgeMs: number | null;
  readonly state: "on_time" | "late";
};

export type OpsQueue = {
  readonly queue: string;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly failed: number;
};

export type OpsAssetOperations = {
  readonly directorySyncOverlapsLastHour: number | null;
  readonly auditWriteFailuresLastHour: number | null;
  readonly importStuckClaims: number;
  readonly overAllocatedLicenseCount: number;
  readonly overAllocatedSeatCount: number;
  readonly failedReminderDeliveries: number;
  readonly staleReminderClaims: number;
  readonly pendingTransferFilePurges: number;
  readonly staleTransferFilePurges: number;
  readonly oldestTransferFilePurgeAgeMinutes: number | null;
  readonly transferFileScanState: "complete" | "limited" | "unavailable";
  readonly scannedTransferFiles: number | null;
  readonly referencedTransferFiles: number | null;
  readonly orphanedTransferFiles: number | null;
  readonly missingTransferFiles: number | null;
};

export type OpsThresholds = {
  readonly diskWarnPercent: number;
  readonly diskCriticalPercent: number;
  readonly http5xxMinCount: number;
  readonly http5xxMinPercent: number;
  readonly slaScanLateMinutes: number;
  readonly workerHeartbeatStaleSeconds: number;
  readonly clamavFailuresBeforeAlert: number;
};

export type OpsSilence = {
  readonly until: string;
  readonly reason: string;
  readonly by: string | null;
};

export type OpsOverview = {
  readonly generatedAt: string;
  /** Latest worker measurement; null until the first run after a deploy. */
  readonly snapshot: { readonly generatedAt: string; readonly ageSeconds: number | null } | null;
  /** Asset workflow/retention metrics from the worker snapshot; null if unavailable.
   * Optional during rolling deploys where an older API has not added this field yet.
   */
  readonly assetOperations?: OpsAssetOperations | null;
  readonly components: {
    readonly api: ProbeState;
    readonly database: ProbeState;
    readonly redis: ProbeState;
    readonly worker: {
      readonly status: "active" | "stale" | "unknown";
      readonly heartbeatAgeSeconds: number | null;
    };
    readonly clamav: OpsClamavState | null;
    readonly disk: {
      readonly usedPercent: number;
      readonly freeBytes: number;
      readonly totalBytes: number;
    } | null;
    readonly eventLoopLagMs: number | null;
    readonly ldapsCaExpiresAt: string | null;
    readonly email: {
      readonly lastSentAt: string | null;
      /** Stale CLAIMED rows awaiting an attempted recovery check. */
      readonly stuckClaims?: number | null;
      /** BA-notifications-07: ambiguous SMTP outcomes awaiting operator reconciliation. */
      readonly unknownDeliveries?: number | null;
      /** Delivery ledger retries coordinated with the integration queue. */
      readonly pendingRetries?: number | null;
      readonly failedDeliveries?: number | null;
      readonly deadDeliveries?: number | null;
    };
    /** Optional during rolling deploys where the API has not added this signal yet. */
    readonly changeDowntimeSync?: ChangeDowntimeSyncHealth | null;
    /** Optional during rolling deploys where the API has not added this signal yet. */
    readonly ticketSideEffectOutbox?: TicketSideEffectOutboxHealth | null;
    /** Optional during rolling deploys where the API has not added this signal yet. */
    readonly notificationFanOutOutbox?: NotificationFanOutOutboxHealth | null;
    /** Per-process fail-closed settings-read health; optional during rolling deploys. */
    readonly templatesConfiguration?: TemplatesConfigurationHealth | null;
    readonly inbound: ReadonlyArray<{
      readonly mailboxKey: string;
      readonly lastRunAt: string | null;
      readonly lastSuccessAt: string | null;
      /** Technical IMAP/Graph error of the last failed read (same text as the inbound panel). */
      readonly lastError: string | null;
      readonly lastErrorAt: string | null;
      readonly consecutiveFails: number;
    }>;
  };
  readonly schedulers: readonly OpsScheduler[];
  readonly queues: readonly OpsQueue[];
  readonly dlq: {
    readonly integrationDlq: number | null;
    readonly growth: {
      readonly integrationDlq: number;
      readonly failedByQueue: Readonly<Record<string, number>>;
    } | null;
  };
  readonly http: {
    readonly series: ReadonlyArray<{
      readonly at: string;
      readonly errors5xx: number;
      readonly total: number;
    }>;
  };
  readonly alerts: readonly OpsAlert[];
  readonly silence: OpsSilence | null;
  readonly configuration: {
    readonly alertsEnabled: boolean;
    readonly reminderHours: number;
    readonly historyDays: number;
    readonly thresholds: OpsThresholds;
    readonly extraRecipientCount: number;
    readonly teamsConfigured: boolean;
    readonly fallbackConfigured: boolean;
    readonly uptimePushConfigured: boolean;
  };
};

export type OpsChannelResult = {
  readonly channel: "email" | "inApp" | "teams";
  readonly status: "sent" | "partial" | "failed" | "skipped";
  readonly delivered: number;
  readonly failed: number;
  readonly reason: string | null;
};

/** §5.4 limits, mirrored from `SilenceOpsAlertsDto`. */
export const opsSilenceLimits = {
  minMinutes: 15,
  maxMinutes: 480,
  minReason: 5,
  maxReason: 300,
} as const;
export const opsSilencePresetMinutes = [30, 60, 120, 240, 480] as const;

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function getOpsOverview(): Promise<OpsOverview> {
  return apiRequest("/ops/health");
}

export function listOpsAlertHistory(limit = 100): Promise<readonly OpsAlert[]> {
  return apiRequest(`/ops/alerts?status=resolved&limit=${limit}`);
}

export function acknowledgeOpsAlert(alertId: string): Promise<OpsAlert> {
  return apiRequest(`/ops/alerts/${encodeURIComponent(alertId)}/acknowledge`, post());
}

export function silenceOpsAlerts(minutes: number, reason: string): Promise<OpsSilence> {
  return apiRequest("/ops/alerts/silence", post({ minutes, reason }));
}

export function unsilenceOpsAlerts(): Promise<{ readonly cleared: boolean }> {
  return apiRequest("/ops/alerts/silence", { method: "DELETE" });
}

export function sendOpsTestAlert(): Promise<{ readonly channels: readonly OpsChannelResult[] }> {
  return apiRequest("/ops/alerts/test", post());
}

export function acknowledgeOpsDlq(): Promise<{
  readonly integrationDlq: number;
  readonly failedByQueue: Readonly<Record<string, number>>;
}> {
  return apiRequest("/ops/dlq/acknowledge", post());
}
