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

  it("explains when the asset signal snapshot is unavailable", () => {
    render(<AssetOperationsSummary overview={{ assetOperations: null } as OpsOverview} />);
    expect(screen.getByText("admin.opsHealth.assetOperations.unavailable")).not.toBeNull();
  });

  it("treats the omitted field from an older API as unavailable during a rolling deploy", () => {
    render(<AssetOperationsSummary overview={{} as OpsOverview} />);
    expect(screen.getByText("admin.opsHealth.assetOperations.unavailable")).not.toBeNull();
  });
});
