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

const overview = {
  generatedAt: "2026-10-19T00:00:00.000Z",
  snapshot: { generatedAt: "2026-10-19T00:00:00.000Z", ageSeconds: 30 },
  components: {
    api: "ok",
    database: "ok",
    redis: "ok",
    worker: { status: "active", heartbeatAgeSeconds: 4 },
  },
  alerts: [{ id: "alert-1", severity: "WARNING" }],
  silence: null,
  queues: [],
  schedulers: [],
  http: { series: [] },
  dlq: { integrationDlq: 0, growth: null },
  configuration: { alertsEnabled: true, historyDays: 90 },
} as unknown as OpsOverview;

describe("OpsHealthCard controller composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.load.mockResolvedValue(undefined);
    vi.mocked(acknowledgeOpsAlert).mockResolvedValue(overview.alerts[0]);
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
