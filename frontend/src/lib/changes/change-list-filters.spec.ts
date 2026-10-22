import { describe, expect, it } from "vitest";
import {
  changeStatusesOf,
  parseChangeFilterValue,
  parseChangeStatusFilter,
} from "./change-list-filters";

describe("change list URL filters", () => {
  it("normalizes invalid status, type and risk values", () => {
    expect(parseChangeStatusFilter("INVALID")).toBe("open");
    expect(changeStatusesOf("all")).toBeUndefined();
    expect(changeStatusesOf("COMPLETED")).toEqual(["COMPLETED"]);
    expect(parseChangeFilterValue("NORMAL", ["STANDARD", "NORMAL"] as const)).toBe("NORMAL");
    expect(parseChangeFilterValue("OTHER", ["STANDARD", "NORMAL"] as const)).toBe("");
  });
});
