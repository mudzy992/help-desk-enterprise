// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ChangeConflictsList } from "@/components/changes/change-conflicts-list";
import type { ChangeConflicts } from "@/services/changes-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "bs" },
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key} ${Object.values(options).join(" ")}`,
  }),
}));

const emptyConflicts: ChangeConflicts = {
  changes: [],
  downtime: [],
  freeze: null,
  freezeBlocks: false,
  hasWarnings: false,
};

function renderList(conflicts: ChangeConflicts) {
  return render(
    <MemoryRouter>
      <ChangeConflictsList conflicts={conflicts} />
    </MemoryRouter>,
  );
}

describe("ChangeConflictsList", () => {
  afterEach(cleanup);

  it("says there is no conflict when nothing overlaps", () => {
    renderList(emptyConflicts);
    expect(screen.getByText("changes.conflicts.none")).toBeTruthy();
    expect(screen.queryByTestId("change-conflicts-restricted-changes")).toBeNull();
  });

  it("names an overlap the reader can see", () => {
    renderList({
      ...emptyConflicts,
      hasWarnings: true,
      changes: [
        {
          id: "change-2",
          number: "CHG000012",
          title: "Mrežni prekid",
          status: "SCHEDULED",
          plannedStart: "2030-05-01T10:00:00.000Z",
          plannedEnd: "2030-05-01T12:00:00.000Z",
          sharedServices: [{ id: "service-1", name: "Mreža" }],
          sharedAssetCount: 2,
        },
      ],
    });
    expect(screen.getByText("CHG000012")).toBeTruthy();
    expect(screen.getByText(/Mrežni prekid/)).toBeTruthy();
    expect(screen.queryByTestId("change-conflicts-restricted-changes")).toBeNull();
  });

  it("counts the overlaps outside the reader scope instead of naming them", () => {
    // BA-changes-04 (W7.45): a hidden overlap is still a warning, never a name.
    renderList({
      ...emptyConflicts,
      hasWarnings: true,
      restricted: { changes: 2, downtime: 1 },
    });
    expect(screen.getByTestId("change-conflicts-restricted-changes").textContent).toContain(
      "changes.conflicts.restrictedChanges 2",
    );
    expect(screen.getByTestId("change-conflicts-restricted-downtime").textContent).toContain(
      "changes.conflicts.restrictedDowntime 1",
    );
    expect(screen.queryByText("changes.conflicts.none")).toBeNull();
  });

  it("warns when the conflict scan was cut (W7.76)", () => {
    renderList({
      ...emptyConflicts,
      hasWarnings: true,
      changes: [],
      truncated: { changes: true, downtime: false },
    });
    expect(screen.getByTestId("change-conflicts-truncated").textContent).toBe(
      "changes.conflicts.truncated",
    );
    // A cut list is not "nothing overlaps".
    expect(screen.queryByText("changes.conflicts.none")).toBeNull();
  });

  it("does not warn when the scan saw everything", () => {
    renderList({ ...emptyConflicts, truncated: { changes: false, downtime: false } });
    expect(screen.queryByTestId("change-conflicts-truncated")).toBeNull();
    expect(screen.getByText("changes.conflicts.none")).toBeTruthy();
  });

  it("ignores a server response without the restricted counts", () => {
    renderList({ ...emptyConflicts, hasWarnings: true });
    expect(screen.queryByTestId("change-conflicts-restricted-changes")).toBeNull();
    expect(screen.queryByTestId("change-conflicts-restricted-downtime")).toBeNull();
  });
});
