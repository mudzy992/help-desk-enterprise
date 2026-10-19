import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AlertItem } from "@/components/admin/ops-health-alerts";
import { ComponentTile } from "@/components/admin/ops-health-components";
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
      dlq: { growth: { failedByQueue: { alpha: 2 } } },
    } as OpsOverview;
    const html = renderToStaticMarkup(<QueueTable overview={overview} />);
    expect(html.indexOf("alpha")).toBeLessThan(html.indexOf("zeta"));
    expect(html).toContain("(+2)");
  });
});
