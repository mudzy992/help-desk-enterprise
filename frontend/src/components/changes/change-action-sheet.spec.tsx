// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeActionSheet } from "@/components/changes/change-action-sheet";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/services/api";
import { actOnChange, getChangeConflicts } from "@/services/changes-api";
import type { ChangeConflicts, ChangeDetail } from "@/services/changes-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/changes-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/changes-api")>();
  return { ...actual, actOnChange: vi.fn(), getChangeConflicts: vi.fn() };
});

const act = vi.mocked(actOnChange);
const preview = vi.mocked(getChangeConflicts);

const snapshotHash = "a".repeat(64);

const conflicts: ChangeConflicts = {
  changes: [
    {
      id: "change-2",
      number: "CHG000012",
      title: "Mrežni prekid",
      status: "SCHEDULED",
      plannedStart: "2030-05-01T10:00:00.000Z",
      plannedEnd: "2030-05-01T12:00:00.000Z",
      sharedServices: [{ id: "service-1", name: "Mreža" }],
      sharedAssetCount: 0,
    },
  ],
  downtime: [],
  freeze: null,
  freezeBlocks: false,
  hasWarnings: true,
  acknowledgedAt: null,
  snapshotHash,
};

const change = {
  id: "change-1",
  number: "CHG000011",
  title: "Nadogradnja mreže",
  type: "STANDARD",
  status: "DRAFT",
  risk: "MEDIUM",
  plannedStart: "2030-05-01T10:00:00.000Z",
  plannedEnd: "2030-05-01T12:00:00.000Z",
  causesDowntime: false,
  owner: null,
  requester: null,
  cabGroup: null,
  organizationalUnit: { id: "ou1", name: "Jedinica A", ouPath: "/root/ou1" },
  services: [],
  serviceCount: 0,
  assetCount: 0,
  createdAt: "2030-04-01T08:00:00.000Z",
  updatedAt: "2030-04-02T08:00:00.000Z",
  detailLevel: "full",
  redactedFields: [],
  description: null,
  reason: null,
  impact: "MEDIUM",
  likelihood: "MEDIUM",
  implementationPlan: null,
  backoutPlan: null,
  testPlan: null,
  communicationPlan: null,
  actualStart: null,
  actualEnd: null,
  outcome: null,
  reviewNotes: null,
  template: null,
  problem: null,
  assets: [],
  approvalRound: 1,
  conflictsAcknowledgedAt: null,
  submittedAt: null,
  authorizedAt: null,
  version: 4,
} as unknown as ChangeDetail;

function renderSheet(onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ChangeActionSheet action="schedule" change={change} onClose={vi.fn()} onDone={onDone} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { onDone };
}

async function tickAndSubmit() {
  fireEvent.click(await screen.findByTestId("change-acknowledge-conflicts"));
  fireEvent.click(screen.getByTestId("change-action-submit"));
}

describe("ChangeActionSheet conflict acknowledgement digest (W7.68)", () => {
  afterEach(() => {
    cleanup();
    act.mockReset();
    preview.mockReset();
  });

  it("echoes the digest of the preview it rendered", async () => {
    preview.mockResolvedValue(conflicts);
    act.mockResolvedValue(change);
    renderSheet();

    await tickAndSubmit();

    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act).toHaveBeenCalledWith("change-1", {
      version: 4,
      action: "schedule",
      acknowledgeConflicts: true,
      conflictSnapshotHash: snapshotHash,
    });
  });

  it("keeps the flag on a server that has no digest to echo yet", async () => {
    preview.mockResolvedValue({ ...conflicts, snapshotHash: null });
    act.mockResolvedValue(change);
    renderSheet();

    fireEvent.click(await screen.findByTestId("change-acknowledge-conflicts"));
    fireEvent.click(screen.getByTestId("change-action-submit"));

    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    // No digest to bind the tick to: the request stays what it was before
    // W7.68, and the newer servers answer CHANGE_CONFLICTS_STALE instead of
    // silently accepting it.
    expect(act).toHaveBeenCalledWith("change-1", {
      version: 4,
      action: "schedule",
      acknowledgeConflicts: true,
    });
  });

  it("reloads the conflicts and drops the tick when the snapshot went stale", async () => {
    preview.mockResolvedValue(conflicts);
    act.mockRejectedValue(new ApiError(409, "CHANGE_CONFLICTS_STALE", "snapshot_changed"));
    renderSheet();

    await tickAndSubmit();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("changes.errors.conflictsStale");
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect((screen.getByTestId("change-acknowledge-conflicts") as HTMLInputElement).checked).toBe(
        false,
      ),
    );
  });
});
