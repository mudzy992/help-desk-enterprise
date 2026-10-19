// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpsHealthCard } from "@/components/admin/ops-health-card";
import { acknowledgeOpsAlert, type OpsOverview } from "@/services/ops-health-api";

const state = vi.hoisted(() => ({ load: vi.fn(), toast: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/lib/ops/use-ops-health-overview", () => ({
  useOpsHealthOverview: () => ({
    overview,
    loadError: null,
    refreshing: false,
    nowMs: Date.parse("2026-10-19T00:02:00.000Z"),
    load: state.load,
  }),
}));
vi.mock("@/services/ops-health-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/ops-health-api")>();
  return { ...actual, acknowledgeOpsAlert: vi.fn() };
});
vi.mock("@/components/admin/ops-health-components", () => ({ ComponentGrid: () => null }));
vi.mock("@/components/admin/ops-health-metrics", () => ({
  HttpChart: () => null,
  SchedulerTable: () => null,
  QueueTable: () => null,
  ChannelSummary: () => null,
}));
vi.mock("@/components/admin/ops-health-alerts", () => ({
  AlertHistory: () => null,
  AlertItem: ({ onAcknowledge }: { onAcknowledge: () => void }) => (
    <button type="button" onClick={onAcknowledge}>
      acknowledge-row
    </button>
  ),
}));
vi.mock("@/components/admin/ops-silence-dialog", () => ({ OpsSilenceDialog: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));

const acknowledgedAlert = {
  id: "alert-1",
  key: "disk.usage",
  severity: "WARNING",
  status: "FIRING",
  details: null,
  firstSeenAt: "2026-10-19T00:00:00.000Z",
  lastSeenAt: "2026-10-19T00:01:00.000Z",
  resolvedAt: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  notifyCount: 1,
  runbook: null,
} as const;

const overview = {
  generatedAt: "2026-10-19T00:00:00.000Z",
  snapshot: { generatedAt: "2026-10-19T00:00:00.000Z", ageSeconds: 30 },
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
  },
  alerts: [acknowledgedAlert],
  silence: null,
  queues: [],
  schedulers: [],
  http: { series: [] },
  dlq: { integrationDlq: 0, growth: null },
  configuration: {
    alertsEnabled: true,
    reminderHours: 4,
    historyDays: 90,
    thresholds: {
      diskWarnPercent: 80,
      diskCriticalPercent: 90,
      http5xxMinCount: 20,
      http5xxMinPercent: 2,
      slaScanLateMinutes: 5,
      workerHeartbeatStaleSeconds: 120,
      clamavFailuresBeforeAlert: 3,
    },
    extraRecipientCount: 0,
    teamsConfigured: false,
    fallbackConfigured: false,
    uptimePushConfigured: true,
  },
} satisfies OpsOverview;

describe("OpsHealthCard controller composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.load.mockResolvedValue(undefined);
    vi.mocked(acknowledgeOpsAlert).mockResolvedValue(acknowledgedAlert);
  });
  afterEach(cleanup);

  it("keeps management actions hidden for a read-only viewer", () => {
    render(<OpsHealthCard canManage={false} />);
    expect(screen.queryByText("admin.opsHealth.test.action")).toBeNull();
    expect(screen.queryByText("admin.opsHealth.silence.action")).toBeNull();
  });

  it("runs an acknowledgement, reports success and refreshes the overview", async () => {
    render(<OpsHealthCard canManage />);
    fireEvent.click(screen.getByRole("button", { name: "acknowledge-row" }));

    await waitFor(() => expect(acknowledgeOpsAlert).toHaveBeenCalledWith("alert-1"));
    await waitFor(() => expect(state.load).toHaveBeenCalledTimes(1));
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "success",
        title: "admin.opsHealth.alerts.acknowledged",
      }),
    );
  });
});
