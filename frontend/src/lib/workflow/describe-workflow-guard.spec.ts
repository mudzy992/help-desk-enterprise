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
  unrouted: {
    enabled: true,
    ownerRole: "SUPER_ADMIN",
    cleanupSlaHours: 8,
    weeklyDigest: true,
    targetGroup: null,
    targetGroupMissing: false,
  },
};

describe("describeWorkflowGuard ()", () => {
  it("uses the live numbers", () => {
    expect(describeWorkflowGuard("reopen_window", parameters)).toMatchObject({
      values: { days: 7 },
      mode: "on",
    });
    expect(describeWorkflowGuard("archive_after", parameters).values).toEqual({ days: 90 });
  });

  it("marks switched-off or unavailable guards as off", () => {
    expect(describeWorkflowGuard("close_code", parameters).mode).toBe("off");
    expect(describeWorkflowGuard("waiting_auto_close", parameters).mode).toBe("off");
    expect(describeWorkflowGuard("approval_decision", parameters).mode).toBe("off");
    expect(describeWorkflowGuard("group_required", parameters).mode).toBe("on");
  });

  it("distinguishes playbook off, warn, and block modes", () => {
    expect(describeWorkflowGuard("playbook_steps", parameters).mode).toBe("off");
    expect(
      describeWorkflowGuard("playbook_steps", {
        ...parameters,
        playbooks: { enabled: true, requiredStepsOnResolve: "warn" },
      }).mode,
    ).toBe("warn");
    expect(
      describeWorkflowGuard("playbook_steps", {
        ...parameters,
        playbooks: { enabled: true, requiredStepsOnResolve: "block" },
      }).mode,
    ).toBe("block");
  });
});
