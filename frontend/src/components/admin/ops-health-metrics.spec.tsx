// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssetOperationsSummary,
  ProblemOperationsSummary,
} from "@/components/admin/ops-health-metrics";
import type { OpsOverview } from "@/services/ops-health-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key} ${Object.values(options).join(" ")}`,
  }),
}));

const assetOperations = {
  directorySyncOverlapsLastHour: null,
  auditWriteFailuresLastHour: null,
  importStuckClaims: 0,
  overAllocatedLicenseCount: 1,
  overAllocatedSeatCount: 2,
  failedReminderDeliveries: 0,
  staleReminderClaims: 0,
  pendingTransferFilePurges: 1,
  staleTransferFilePurges: 0,
  oldestTransferFilePurgeAgeMinutes: 4,
  transferFileScanState: "limited" as const,
  scannedTransferFiles: null,
  referencedTransferFiles: null,
  orphanedTransferFiles: null,
  missingTransferFiles: null,
};

const overview = { assetOperations } as OpsOverview;

describe("AssetOperationsSummary", () => {
  afterEach(cleanup);

  it("keeps incomplete filesystem and Redis measurements unknown instead of showing zero", () => {
    render(<AssetOperationsSummary overview={overview} />);

    expect(screen.getByText("admin.opsHealth.assetOperations.transferScan.limited")).not.toBeNull();
    expect(screen.queryByText(/admin\.opsHealth\.assetOperations\.transferScanValue/)).toBeNull();
    expect(screen.getAllByText("admin.opsHealth.assetOperations.unknown")).toHaveLength(2);
    expect(
      screen.getByText(/admin\.opsHealth\.assetOperations\.transferPurgeValue 1 0 4/),
    ).not.toBeNull();
  });

  it("keeps each metric term and value in a valid description-list group", () => {
    const { container } = render(<AssetOperationsSummary overview={overview} />);
    const list = container.querySelector("dl");

    expect(list).not.toBeNull();
    const groups = Array.from(list!.children);
    expect(groups).toHaveLength(6);

    for (const group of groups) {
      const children = Array.from(group.children);
      expect(children[0]?.tagName).toBe("DT");
      expect(children.slice(1).length).toBeGreaterThan(0);
      expect(children.slice(1).every((child) => child.tagName === "DD")).toBe(true);
      expect(group.querySelectorAll("dt")).toHaveLength(1);
    }
  });

  it("explains when the asset signal snapshot is unavailable", () => {
    render(<AssetOperationsSummary overview={{ assetOperations: null } as OpsOverview} />);
    expect(screen.getByText("admin.opsHealth.assetOperations.unavailable")).not.toBeNull();
  });

  it("treats the omitted field from an older API as unavailable during a rolling deploy", () => {
    render(<AssetOperationsSummary overview={{} as OpsOverview} />);
    expect(screen.getByText("admin.opsHealth.assetOperations.unavailable")).not.toBeNull();
  });
});

const problemOperations = {
  stuckReminderDeliveries: 2,
  deadReminderDeliveries: 1,
  oldestStuckReminderMinutes: 45,
  breachedOpenTargets: 3,
  oldestOverdueTargetMinutes: 300,
  autoCloseDue: 4,
  oldestAutoCloseDueMinutes: 720,
  effectiveAutoCloseDays: 14,
  // W7.42: queued problem notices and the rows the worker gave up on.
  noticeOutbox: { pending: 3, processing: 1, deadLetter: 2, oldestPendingMinutes: 12 },
};

describe("ProblemOperationsSummary (BA-problems-18)", () => {
  afterEach(cleanup);

  it("shows the backlog and how far behind it is", () => {
    render(<ProblemOperationsSummary overview={{ problemOperations } as OpsOverview} />);

    expect(
      screen.getByText(/admin\.opsHealth\.problemOperations\.stuckRemindersValue 2 1/),
    ).not.toBeNull();
    expect(
      screen.getByText(/admin\.opsHealth\.problemOperations\.minutesValue 300/),
    ).not.toBeNull();
    expect(
      screen.getByText(/admin\.opsHealth\.problemOperations\.autoCloseWindow 14/),
    ).not.toBeNull();
  });

  it("shows the queued problem notices and the dead letters separately", () => {
    render(<ProblemOperationsSummary overview={{ problemOperations } as OpsOverview} />);

    expect(
      screen.getByText(/admin\.opsHealth\.problemOperations\.noticesQueuedValue 4 2/),
    ).not.toBeNull();
    expect(
      screen.getByText(/admin\.opsHealth\.problemOperations\.minutesValue 12/),
    ).not.toBeNull();
  });

  it("hides the notice tiles when an older API does not report them", () => {
    const { noticeOutbox: _omitted, ...withoutNotices } = problemOperations;
    render(
      <ProblemOperationsSummary overview={{ problemOperations: withoutNotices } as OpsOverview} />,
    );

    expect(screen.queryByText(/admin\.opsHealth\.problemOperations\.noticesQueued/)).toBeNull();
  });

  it("keeps an unreadable setting unknown instead of announcing a zero backlog", () => {
    render(
      <ProblemOperationsSummary
        overview={
          {
            problemOperations: {
              ...problemOperations,
              autoCloseDue: null,
              oldestAutoCloseDueMinutes: null,
              effectiveAutoCloseDays: null,
            },
          } as OpsOverview
        }
      />,
    );

    // Two unknown values: the auto-close count and its wait; the window line disappears.
    expect(screen.getAllByText("admin.opsHealth.problemOperations.unknown")).toHaveLength(2);
    expect(screen.queryByText(/autoCloseWindow/)).toBeNull();
  });

  it("explains when the snapshot is unavailable, including an older API during a rolling deploy", () => {
    render(<ProblemOperationsSummary overview={{ problemOperations: null } as OpsOverview} />);
    expect(screen.getByText("admin.opsHealth.problemOperations.unavailable")).not.toBeNull();

    cleanup();
    render(<ProblemOperationsSummary overview={{} as OpsOverview} />);
    expect(screen.getByText("admin.opsHealth.problemOperations.unavailable")).not.toBeNull();
  });

  it("keeps every metric in a valid description-list group", () => {
    const { container } = render(
      <ProblemOperationsSummary overview={{ problemOperations } as OpsOverview} />,
    );
    const list = container.querySelector("dl");
    expect(list).not.toBeNull();

    const groups = Array.from(list!.children);
    expect(groups).toHaveLength(8);
    for (const group of groups) {
      expect(group.querySelectorAll("dt")).toHaveLength(1);
      expect(
        Array.from(group.children)
          .slice(1)
          .every((child) => child.tagName === "DD"),
      ).toBe(true);
    }
  });
});
