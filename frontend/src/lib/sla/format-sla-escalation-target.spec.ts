import { describe, expect, it } from "vitest";
import { formatSlaEscalationTarget } from "@/lib/sla/format-sla-escalation-target";

const translate = (key: string, options?: Record<string, string>): string => {
  switch (key) {
    case "sla.escalationTargetRoleValue":
      return `Role: ${options?.role ?? ""}`;
    case "sla.escalationTargetGroupValue":
      return `Group: ${options?.group ?? ""}`;
    case "sla.escalationTargetOnCallValue":
      return `On-call in ${options?.group ?? ""}`;
    case "sla.escalationGroupLoading":
      return "Loading group…";
    case "sla.escalationGroupUnknown":
      return "Unknown group";
    case "sla.escalationTargetUserValue":
      return `User: ${options?.id ?? ""}`;
    default:
      return key;
  }
};

describe("formatSlaEscalationTarget", () => {
  it("uses a group name instead of exposing its internal ID", () => {
    const rule = {
      targetRole: null,
      targetGroupId: "group-id-123",
      targetUserId: null,
      targetOnCall: false,
    };

    expect(
      formatSlaEscalationTarget(rule, translate, new Map([["group-id-123", "Service Desk"]])),
    ).toBe("Group: Service Desk");
  });

  it("uses the same group name for an on-call escalation", () => {
    const rule = {
      targetRole: null,
      targetGroupId: "group-id-123",
      targetUserId: null,
      targetOnCall: true,
    };

    expect(
      formatSlaEscalationTarget(rule, translate, new Map([["group-id-123", "Service Desk"]])),
    ).toBe("On-call in Service Desk");
  });

  it("shows localized loading and missing-group fallbacks without leaking IDs", () => {
    const rule = {
      targetRole: null,
      targetGroupId: "group-id-123",
      targetUserId: null,
      targetOnCall: false,
    };

    expect(formatSlaEscalationTarget(rule, translate, null)).toBe("Group: Loading group…");
    expect(formatSlaEscalationTarget(rule, translate, new Map())).toBe("Group: Unknown group");
  });
});
