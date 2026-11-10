// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetOperationsSummary } from "@/components/admin/ops-health-metrics";
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
