import { describe, expect, it } from "vitest";
import { profilingRequested } from "./application-profiler";

describe("application profiler gate", () => {
  it("is opt-in and does not add production profiling by default", () => {
    expect(profilingRequested({ search: "" })).toBe(false);
    expect(profilingRequested({ search: "?profile=0" })).toBe(false);
    expect(profilingRequested({ search: "?tab=all&profile=1" })).toBe(true);
  });
});
