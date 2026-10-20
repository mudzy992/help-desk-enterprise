import { describe, expect, it } from "vitest";
import { buildChangeConflictPreview } from "@/lib/changes/change-conflict-preview";

const valid = {
  open: true,
  type: "NORMAL" as const,
  plannedStart: "2026-10-20T10:00:00.000Z",
  plannedEnd: "2026-10-20T11:00:00.000Z",
  serviceIds: ["service-1"],
  assetIds: ["asset-1"],
  changeId: "change-1",
};

describe("buildChangeConflictPreview", () => {
  it("builds an isolated conflict request", () => {
    expect(buildChangeConflictPreview(valid)).toEqual({
      type: "NORMAL",
      plannedStart: valid.plannedStart,
      plannedEnd: valid.plannedEnd,
      serviceIds: ["service-1"],
      assetIds: ["asset-1"],
      changeId: "change-1",
    });
  });
  it("does not request conflicts for a closed sheet or incomplete window", () => {
    expect(buildChangeConflictPreview({ ...valid, open: false })).toBeNull();
    expect(buildChangeConflictPreview({ ...valid, plannedEnd: null })).toBeNull();
  });
  it("rejects reversed and zero-length windows", () => {
    expect(buildChangeConflictPreview({ ...valid, plannedEnd: valid.plannedStart })).toBeNull();
    expect(buildChangeConflictPreview({ ...valid, plannedStart: valid.plannedEnd })).toBeNull();
  });
});
