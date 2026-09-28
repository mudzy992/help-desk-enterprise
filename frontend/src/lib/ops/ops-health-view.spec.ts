import { describe, expect, it } from "vitest";
import {
  alertDetailEntries,
  alertDurationMs,
  clamavState,
  diskState,
  dlqGrowthTotal,
  eventLoopState,
  formatOpsDuration,
  httpBars,
  inboundState,
  ldapsCaState,
  opsAlertSlug,
  overallOpsState,
  sortSchedulers,
} from "@/lib/ops/ops-health-view";
import type { OpsAlert, OpsOverview } from "@/services/ops-health-api";

const thresholds = {
  diskWarnPercent: 80,
  diskCriticalPercent: 90,
  http5xxMinCount: 20,
  http5xxMinPercent: 2,
  slaScanLateMinutes: 5,
  workerHeartbeatStaleSeconds: 120,
  clamavFailuresBeforeAlert: 3,
};

function overview(patch: Partial<OpsOverview> = {}, components: Partial<OpsOverview["components"]> = {}): OpsOverview {
  return {
    generatedAt: "2026-11-20T10:00:00.000Z",
    snapshot: { generatedAt: "2026-11-20T09:59:30.000Z", ageSeconds: 30 },
    components: {
      api: "ok",
      database: "ok",
      redis: "ok",
      worker: { status: "active", heartbeatAgeSeconds: 4 },
      clamav: { configured: true, ok: true, failOpen: false },
      disk: { usedPercent: 40, freeBytes: 60, totalBytes: 100 },
      eventLoopLagMs: 12,
      ldapsCaExpiresAt: null,
      email: { lastSentAt: null },
      inbound: [],
      ...components,
    },
    schedulers: [],
    queues: [],
    dlq: { integrationDlq: 0, growth: null },
    http: { series: [] },
    alerts: [],
    silence: null,
    configuration: {
      alertsEnabled: true,
      reminderHours: 4,
      historyDays: 90,
      thresholds,
      extraRecipientCount: 0,
      teamsConfigured: false,
      fallbackConfigured: false,
      uptimePushConfigured: true,
    },
    ...patch,
  };
}

const alert = (patch: Partial<OpsAlert> = {}): OpsAlert => ({
  id: "a1",
  key: "disk.usage",
  severity: "WARNING",
  status: "FIRING",
  details: null,
  firstSeenAt: "2026-11-20T09:00:00.000Z",
  lastSeenAt: "2026-11-20T09:59:00.000Z",
  resolvedAt: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  notifyCount: 1,
  runbook: null,
  ...patch,
});

describe("ops health view", () => {
  it("maps backend keys to i18n slugs and rejects unknown ones", () => {
    expect(opsAlertSlug("disk.usage")).toBe("disk_usage");
    expect(opsAlertSlug("tls.ldapsCa.expiry")).toBe("tls_ldapsCa_expiry");
    expect(opsAlertSlug("ops.test")).toBe("ops_test");
    expect(opsAlertSlug("future.alarm")).toBeNull();
  });

  it("derives the overall state", () => {
    expect(overallOpsState(overview())).toBe("ok");
    expect(overallOpsState(overview({ alerts: [alert()] }))).toBe("degraded");
    expect(overallOpsState(overview({ snapshot: null }))).toBe("degraded");
    expect(overallOpsState(overview({ snapshot: { generatedAt: "x", ageSeconds: 400 } }))).toBe("degraded");
    expect(overallOpsState(overview({ alerts: [alert({ severity: "CRITICAL" })] }))).toBe("down");
    expect(overallOpsState(overview({}, { redis: "fail" }))).toBe("down");
    expect(overallOpsState(overview({}, { worker: { status: "stale", heartbeatAgeSeconds: 500 } }))).toBe("down");
  });

  it("colours components by the configured thresholds", () => {
    expect(diskState(null, thresholds)).toBe("unknown");
    expect(diskState({ usedPercent: 79.9, freeBytes: 1, totalBytes: 1 }, thresholds)).toBe("ok");
    expect(diskState({ usedPercent: 80, freeBytes: 1, totalBytes: 1 }, thresholds)).toBe("warning");
    expect(diskState({ usedPercent: 95, freeBytes: 1, totalBytes: 1 }, thresholds)).toBe("fail");
    expect(clamavState({ configured: false })).toBe("off");
    expect(clamavState({ configured: true, ok: false, failOpen: true })).toBe("warning");
    expect(clamavState({ configured: true, ok: false, failOpen: false })).toBe("fail");
    expect(eventLoopState(600)).toBe("warning");
    expect(eventLoopState(2500)).toBe("fail");
    expect(inboundState({ mailboxKey: "m", lastRunAt: null, lastSuccessAt: null, lastError: "x", lastErrorAt: null, consecutiveFails: 3 })).toBe("fail");
  });

  it("counts LDAPS CA days with the backend 30/7 limits", () => {
    const now = Date.parse("2026-11-20T00:00:00.000Z");
    expect(ldapsCaState(null, now)).toEqual({ state: "off", daysLeft: null });
    expect(ldapsCaState("2027-06-01T00:00:00.000Z", now).state).toBe("ok");
    expect(ldapsCaState("2026-12-10T00:00:00.000Z", now)).toEqual({ state: "warning", daysLeft: 20 });
    expect(ldapsCaState("2026-11-25T00:00:00.000Z", now)).toEqual({ state: "fail", daysLeft: 5 });
  });

  it("formats durations compactly", () => {
    expect(formatOpsDuration(45_000)).toBe("45 s");
    expect(formatOpsDuration(12 * 60_000)).toBe("12 min");
    expect(formatOpsDuration(3 * 3_600_000)).toBe("3 h");
    expect(formatOpsDuration(3 * 3_600_000 + 5 * 60_000)).toBe("3 h 5 min");
    expect(formatOpsDuration(98 * 3_600_000)).toBe("4 d 2 h");
    expect(formatOpsDuration(-5)).toBe("0 s");
    expect(alertDurationMs(alert(), Date.parse("2026-11-20T10:00:00.000Z"))).toBe(3_600_000);
    expect(alertDurationMs(alert({ resolvedAt: "2026-11-20T09:12:00.000Z" }), 0)).toBe(12 * 60_000);
  });

  it("flattens alarm details", () => {
    expect(
      alertDetailEntries({
        usedPercent: 83,
        failedByQueue: { email: 2 },
        jobs: [{ queue: "reports", schedulerId: "weekly" }],
        empty: null,
      }),
    ).toEqual([
      ["usedPercent", "83"],
      ["failedByQueue.email", "2"],
      ["jobs", "reports/weekly"],
    ]);
    expect(alertDetailEntries(null)).toEqual([]);
  });

  it("builds chart bars, DLQ growth and scheduler order", () => {
    const { bars, max, totalErrors } = httpBars([
      { at: "a", errors5xx: 0, total: 10 },
      { at: "b", errors5xx: 4, total: 10 },
      { at: "c", errors5xx: 2, total: 10 },
    ]);
    expect(max).toBe(4);
    expect(totalErrors).toBe(6);
    expect(bars.map((bar) => bar.heightPercent)).toEqual([0, 100, 50]);
    expect(httpBars([]).max).toBe(1);
    expect(dlqGrowthTotal({ integrationDlq: 5, growth: { integrationDlq: 2, failedByQueue: { a: 1, b: 3 } } })).toBe(6);
    expect(dlqGrowthTotal({ integrationDlq: 5, growth: null })).toBe(0);
    const base = { everyMs: 60_000, pattern: null, nextAt: null, lastSuccessAt: null, lastFailureAt: null, graceMs: 0 };
    expect(
      sortSchedulers([
        { ...base, queue: "b", schedulerId: "x", state: "on_time" },
        { ...base, queue: "z", schedulerId: "x", state: "late" },
        { ...base, queue: "a", schedulerId: "x", state: "on_time" },
      ]).map((scheduler) => scheduler.queue),
    ).toEqual(["z", "a", "b"]);
  });
});
