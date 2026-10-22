import { describe, expect, it } from "vitest";
import { parseProblemStatusFilter, problemStatusesOf } from "./problem-list-filters";

describe("problem list status filters", () => {
  it("falls back invalid URL state to the open preset", () => {
    expect(parseProblemStatusFilter("INVALID")).toBe("open");
    expect(problemStatusesOf("all")).toBeUndefined();
    expect(problemStatusesOf("RESOLVED")).toEqual(["RESOLVED"]);
    expect(problemStatusesOf("open")).not.toContain("CLOSED");
  });
});
