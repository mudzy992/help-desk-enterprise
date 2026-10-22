import { describe, expect, it } from "vitest";
import { formatOnCallRange, resolveSelectedOnCallGroupId } from "./on-call-page-model";
import type { OnCallOverview } from "@/services/on-call-api";

const overview: OnCallOverview = {
  canManage: true,
  groups: [
    {
      groupId: "empty",
      groupName: "Empty",
      hasSchedule: false,
      isActive: false,
      timezone: null,
      current: null,
    },
    {
      groupId: "scheduled",
      groupName: "Scheduled",
      hasSchedule: true,
      isActive: true,
      timezone: "Europe/Sarajevo",
      current: null,
    },
  ],
};

describe("on-call page model", () => {
  it("prefers the requested group, then a scheduled group, then the first group", () => {
    expect(resolveSelectedOnCallGroupId(overview, "empty")).toBe("empty");
    expect(resolveSelectedOnCallGroupId(overview, "missing")).toBe("scheduled");
    expect(resolveSelectedOnCallGroupId({ ...overview, groups: [overview.groups[0]] }, null)).toBe(
      "empty",
    );
    expect(resolveSelectedOnCallGroupId(null, null)).toBeNull();
  });

  it("formats the complete 28-day calendar range in the schedule timezone", () => {
    expect(formatOnCallRange(new Date("2026-10-19T00:00:00.000Z"), "en", "UTC")).toBe(
      "19/10/2026 – 15/11/2026",
    );
  });
});
