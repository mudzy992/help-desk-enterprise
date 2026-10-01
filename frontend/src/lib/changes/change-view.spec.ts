import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import {
  actionChecksConflicts,
  actionNeedsReason,
  changeHistoryText,
  computeChangeRisk,
  mapChangeError,
  primaryChangeAction,
  reviewNotesMin,
} from "@/lib/changes/change-view";

describe("computeChangeRisk (§7)", () => {
  it("maps impact × likelihood to the four risk levels", () => {
    expect(computeChangeRisk("LOW", "LOW")).toBe("LOW");
    expect(computeChangeRisk("LOW", "MEDIUM")).toBe("LOW");
    expect(computeChangeRisk("LOW", "HIGH")).toBe("MEDIUM");
    expect(computeChangeRisk("MEDIUM", "MEDIUM")).toBe("MEDIUM");
    expect(computeChangeRisk("MEDIUM", "HIGH")).toBe("HIGH");
    expect(computeChangeRisk("HIGH", "HIGH")).toBe("CRITICAL");
  });
});

describe("action rules (§6, §9, §12)", () => {
  it("asks for a reason on return, withdraw and cancel only", () => {
    expect(actionNeedsReason("cancel")).toBe(true);
    expect(actionNeedsReason("withdraw")).toBe(true);
    expect(actionNeedsReason("return")).toBe(true);
    expect(actionNeedsReason("submit")).toBe(false);
  });

  it("checks conflicts where the window is committed", () => {
    expect(actionChecksConflicts("authorize", "NORMAL")).toBe(true);
    expect(actionChecksConflicts("schedule", "STANDARD")).toBe(true);
    expect(actionChecksConflicts("submit", "EMERGENCY")).toBe(true);
    expect(actionChecksConflicts("submit", "NORMAL")).toBe(false);
  });

  it("needs a longer review for failed outcomes", () => {
    expect(reviewNotesMin("SUCCESSFUL")).toBe(1);
    expect(reviewNotesMin("ROLLED_BACK")).toBe(20);
  });

  it("never makes cancel, return or withdraw the primary step", () => {
    expect(primaryChangeAction(["return", "authorize", "cancel"])).toBe("authorize");
    expect(primaryChangeAction(["withdraw", "cancel"])).toBeUndefined();
  });
});

describe("mapChangeError", () => {
  it("names the missing requirement", () => {
    expect(mapChangeError(new ApiError(409, "CHANGE_REQUIREMENT_MISSING", "backoutPlan"))).toBe("changes.errors.requirement.backoutPlan");
    expect(mapChangeError(new ApiError(403, "CHANGE_NOT_APPROVER", "requester"))).toBe("changes.errors.requesterVote");
    expect(mapChangeError(new ApiError(409, "CHANGE_FREEZE", "Kraj godine"))).toBe("changes.errors.freeze");
    expect(mapChangeError(new Error("x"))).toBeNull();
  });
});

describe("changeHistoryText", () => {
  const t = (key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ""}`;
  it("describes CAB votes and status changes", () => {
    expect(changeHistoryText(t, "approval", { decision: "APPROVED", approvals: 1, quorum: 2, round: 1 })).toContain("changes.history.approved");
    expect(changeHistoryText(t, "status", { from: "DRAFT", to: "ASSESSMENT", action: "submit" })).toContain("changes.status.ASSESSMENT");
    expect(changeHistoryText(t, "downtime", { created: 2, updated: 0, deleted: 0, skippedServiceIds: ["s"] })).toContain('"skipped":1');
  });
});
