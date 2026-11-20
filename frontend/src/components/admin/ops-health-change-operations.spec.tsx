// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeOperationsSummary } from "@/components/admin/ops-health-change-operations";
import type { OpsChangeOperations, OpsOverview } from "@/services/ops-health-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key} ${Object.values(options).join(" ")}`,
  }),
}));

const healthy: OpsChangeOperations = {
  reminders: {
    upcoming24h: 0,
    dueReminders: 0,
    overdueOpen: 0,
    oldestOverdueMinutes: null,
    reminderHoursBeforeStart: 24,
  },
  delivery: { pending: 0, processing: 0, deadLetter: 0, oldestPendingMinutes: null },
  downtime: {
    skippedServices24h: 0,
    lastPass: { completedAtMs: Date.parse("2030-05-01T11:59:00.000Z"), scanned: 12, drifted: 0 },
  },
};

function renderSection(changeOperations: OpsChangeOperations | null | undefined) {
  const overview = { components: { changeOperations } } as unknown as OpsOverview;
  return render(<ChangeOperationsSummary overview={overview} />);
}

describe("ChangeOperationsSummary (W7.69)", () => {
  afterEach(cleanup);

  it("shows the reminder, delivery and drift numbers", () => {
    renderSection({
      reminders: {
        upcoming24h: 3,
        dueReminders: 2,
        overdueOpen: 1,
        oldestOverdueMinutes: 90,
        reminderHoursBeforeStart: 24,
      },
      delivery: { pending: 4, processing: 1, deadLetter: 2, oldestPendingMinutes: 30 },
      downtime: {
        skippedServices24h: 5,
        lastPass: {
          completedAtMs: Date.parse("2030-05-01T11:59:00.000Z"),
          scanned: 40,
          drifted: 2,
        },
      },
    });

    expect(screen.getByTestId("ops-health-changes")).toBeTruthy();
    expect(screen.getByText("admin.opsHealth.changeOperations.dueReminders")).toBeTruthy();
    expect(screen.getByText("admin.opsHealth.changeOperations.countValue 2")).toBeTruthy();
    expect(screen.getByText("admin.opsHealth.changeOperations.deliveryValue 5 2")).toBeTruthy();
    expect(screen.getByText("admin.opsHealth.changeOperations.driftValue 2 40")).toBeTruthy();
    expect(screen.getByText("admin.opsHealth.changeOperations.countValue 5")).toBeTruthy();
    expect(screen.getByText("admin.opsHealth.changeOperations.reminderWindow 24")).toBeTruthy();
  });

  it("says unknown for an unreadable setting and a missing drift pass", () => {
    renderSection({
      ...healthy,
      reminders: { ...healthy.reminders, dueReminders: null, reminderHoursBeforeStart: null },
      downtime: { ...healthy.downtime, lastPass: null },
    });

    expect(
      screen.getAllByText("admin.opsHealth.changeOperations.unknown").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/admin\.opsHealth\.changeOperations\.reminderWindow/)).toBeNull();
  });

  it("explains an unavailable signal instead of rendering zeros", () => {
    renderSection(null);
    expect(screen.getByText("admin.opsHealth.changeOperations.unavailable")).toBeTruthy();
  });

  it("stays quiet on an older API that does not send the signal", () => {
    renderSection(undefined);
    expect(screen.getByText("admin.opsHealth.changeOperations.unavailable")).toBeTruthy();
  });
});
