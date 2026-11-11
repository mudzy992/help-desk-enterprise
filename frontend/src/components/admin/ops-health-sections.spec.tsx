import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AlertItem } from "@/components/admin/ops-health-alerts";
import { ComponentGrid, ComponentTile } from "@/components/admin/ops-health-components";
import { QueueTable } from "@/components/admin/ops-health-metrics";
import type { OpsAlert, OpsOverview } from "@/services/ops-health-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

const alert: OpsAlert = {
  id: "alert-1",
  key: "future.alert",
  severity: "WARNING",
  status: "FIRING",
  details: { queue: "email" },
  firstSeenAt: "2026-10-19T00:00:00.000Z",
  lastSeenAt: "2026-10-19T00:01:00.000Z",
  resolvedAt: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  notifyCount: 1,
  runbook: "runbook/future",
};

describe("ops health presentation sections", () => {
  it("renders component state independently from the controller", () => {
    const html = renderToStaticMarkup(
      <ComponentTile label="Database" state="fail">
        unavailable
      </ComponentTile>,
    );
    expect(html).toContain("Database");
    expect(html).toContain("admin.opsHealth.state.fail");
    expect(html).toContain("unavailable");
  });

  it("warns when an e-mail outcome needs operator reconciliation", () => {
    const overview = {
      components: {
        api: "ok",
        database: "ok",
        redis: "ok",
        worker: { status: "active", heartbeatAgeSeconds: 1 },
        clamav: null,
        disk: null,
        eventLoopLagMs: null,
        ldapsCaExpiresAt: null,
        email: { lastSentAt: null, stuckClaims: 0, unknownDeliveries: 2 },
        inbound: [],
      },
      configuration: {
        thresholds: {
          diskWarnPercent: 80,
          diskCriticalPercent: 90,
          http5xxMinCount: 20,
          http5xxMinPercent: 2,
          slaScanLateMinutes: 5,
          workerHeartbeatStaleSeconds: 120,
          clamavFailuresBeforeAlert: 3,
        },
      },
    } as unknown as OpsOverview;
    const html = renderToStaticMarkup(
      <ComponentGrid overview={overview} nowMs={Date.parse("2026-10-19T00:02:00.000Z")} />,
    );

    expect(html).toContain("admin.opsHealth.components.unknownEmailDeliveries");
    expect(html).toContain("admin.opsHealth.state.warning");
  });

  it("warns on terminal delivery failures and reports their count", () => {
    const overview = {
      components: {
        api: "ok",
        database: "ok",
        redis: "ok",
        worker: { status: "active", heartbeatAgeSeconds: 1 },
        clamav: null,
        disk: null,
        eventLoopLagMs: null,
        ldapsCaExpiresAt: null,
        email: {
          lastSentAt: "2026-10-19T00:00:00.000Z",
          stuckClaims: 0,
          unknownDeliveries: 0,
          pendingRetries: 0,
          failedDeliveries: 0,
          deadDeliveries: 2,
        },
        inbound: [],
      },
      configuration: {
        thresholds: {
          diskWarnPercent: 80,
          diskCriticalPercent: 90,
          http5xxMinCount: 20,
          http5xxMinPercent: 2,
          slaScanLateMinutes: 5,
          workerHeartbeatStaleSeconds: 120,
          clamavFailuresBeforeAlert: 3,
        },
      },
    } as unknown as OpsOverview;
    const html = renderToStaticMarkup(
      <ComponentGrid overview={overview} nowMs={Date.parse("2026-10-19T00:02:00.000Z")} />,
    );

    expect(html).toContain("admin.opsHealth.components.deadEmailDeliveries");
    expect(html).toContain("admin.opsHealth.state.warning");
  });

  it("surfaces change downtime backlog and dead-letter state in the component grid", () => {
    const overview = {
      components: {
        api: "ok",
        database: "ok",
        redis: "ok",
        worker: { status: "active", heartbeatAgeSeconds: 1 },
        clamav: null,
        disk: null,
        eventLoopLagMs: null,
        ldapsCaExpiresAt: null,
        email: { lastSentAt: null },
        changeDowntimeSync: {
          status: "degraded",
          pending: 2,
          processing: 1,
          deadLetter: 1,
          oldestPendingAgeMs: 360_000,
        },
        ticketSideEffectOutbox: {
          status: "degraded",
          pending: 2,
          processing: 1,
          deadLetter: 1,
          oldestPendingAgeMs: 360_000,
        },
        notificationFanOutOutbox: {
          status: "degraded",
          pending: 3,
          processing: 1,
          deadLetter: 1,
          oldestPendingAgeMs: 360_000,
        },
        inbound: [],
      },
      configuration: {
        thresholds: {
          diskWarnPercent: 80,
          diskCriticalPercent: 90,
          http5xxMinCount: 20,
          http5xxMinPercent: 2,
          slaScanLateMinutes: 5,
          workerHeartbeatStaleSeconds: 120,
          clamavFailuresBeforeAlert: 3,
        },
      },
    } as unknown as OpsOverview;
    const html = renderToStaticMarkup(
      <ComponentGrid overview={overview} nowMs={Date.parse("2026-10-19T00:02:00.000Z")} />,
    );

    expect(html).toContain("admin.opsHealth.components.changeDowntimeSync");
    expect(html).toContain("admin.opsHealth.state.warning");
    expect(html).toContain("admin.opsHealth.components.changeDowntimeSyncValue");
    expect(html).toContain("admin.opsHealth.components.ticketSideEffectOutbox");
    expect(html).toContain("admin.opsHealth.components.ticketSideEffectOutboxValue");
    expect(html).toContain("admin.opsHealth.components.notificationFanOutOutbox");
    expect(html).toContain("admin.opsHealth.components.notificationFanOutOutboxValue");
  });

  it("shows template settings degradation as a health warning", () => {
    const overview = {
      components: {
        api: "ok",
        database: "ok",
        redis: "ok",
        worker: { status: "active", heartbeatAgeSeconds: 1 },
        clamav: null,
        disk: null,
        eventLoopLagMs: null,
        ldapsCaExpiresAt: null,
        email: { lastSentAt: null },
        templatesConfiguration: {
          status: "degraded",
          readFailuresTotal: 2,
          lastFailureAt: "2026-10-19T00:00:00.000Z",
          lastRecoveryAt: null,
        },
        inbound: [],
      },
      configuration: {
        thresholds: {
          diskWarnPercent: 80,
          diskCriticalPercent: 90,
          http5xxMinCount: 20,
          http5xxMinPercent: 2,
          slaScanLateMinutes: 5,
          workerHeartbeatStaleSeconds: 120,
          clamavFailuresBeforeAlert: 3,
        },
      },
    } as unknown as OpsOverview;
    const html = renderToStaticMarkup(
      <ComponentGrid overview={overview} nowMs={Date.parse("2026-10-19T00:02:00.000Z")} />,
    );

    expect(html).toContain("admin.opsHealth.components.templatesConfiguration");
    expect(html).toContain("admin.opsHealth.components.templatesConfigurationDegraded");
    expect(html).toContain("admin.opsHealth.state.warning");
  });

  it("keeps unknown alerts renderable with details and acknowledgement action", () => {
    const html = renderToStaticMarkup(
      <AlertItem
        alert={alert}
        nowMs={Date.parse("2026-10-19T00:02:00.000Z")}
        busy={false}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(html).toContain("future.alert");
    expect(html).toContain("runbook/future");
    expect(html).toContain("admin.opsHealth.alerts.acknowledge");
  });

  it("sorts queue rows and highlights DLQ growth", () => {
    const overview = {
      queues: [
        { queue: "zeta", waiting: 0, active: 0, delayed: 0, failed: 2 },
        { queue: "alpha", waiting: 1, active: 1, delayed: 0, failed: 3 },
      ],
      dlq: {
        integrationDlq: 0,
        growth: { integrationDlq: 0, failedByQueue: { alpha: 2 } },
      },
    } satisfies Pick<OpsOverview, "queues" | "dlq">;
    const html = renderToStaticMarkup(<QueueTable overview={overview} />);
    expect(html.indexOf("alpha")).toBeLessThan(html.indexOf("zeta"));
    expect(html).toContain("(+2)");
  });
});
