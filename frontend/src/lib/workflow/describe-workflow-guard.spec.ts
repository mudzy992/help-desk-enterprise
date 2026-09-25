import { describe, expect, it } from "vitest";
import { describeWorkflowGuard } from "./describe-workflow-guard";
import type { TicketWorkflowResponse } from "@/services/workflow-api";

const parameters: TicketWorkflowResponse["parameters"] = {
  closeCodes: { enabled: true, requireOnResolve: false },
  requiredFields: { enabled: true, globalCount: 2 },
  reopen: { enabled: true, windowDays: 7 },
  waitingForUser: { enabled: false, reminderAfterDays: 3, autoCloseAfterDays: 10 },
  approvals: null,
  archive: { enabled: true, afterClosedDays: 90 },
  unrouted: { enabled: true, ownerRole: "SUPER_ADMIN", cleanupSlaHours: 8, weeklyDigest: true, targetGroup: null, targetGroupMissing: false },
};

describe("describeWorkflowGuard (paket 1.7)", () => {
  it("uses the live numbers", () => {
    expect(describeWorkflowGuard("reopen_window", parameters)).toMatchObject({ values: { days: 7 }, inactive: false });
    expect(describeWorkflowGuard("archive_after", parameters).values).toEqual({ days: 90 });
  });

  it("marks switched-off or unavailable guards inactive", () => {
    expect(describeWorkflowGuard("close_code", parameters).inactive).toBe(true);
    expect(describeWorkflowGuard("waiting_auto_close", parameters).inactive).toBe(true);
    expect(describeWorkflowGuard("approval_decision", parameters).inactive).toBe(true);
    expect(describeWorkflowGuard("group_required", parameters).inactive).toBe(false);
  });
});
