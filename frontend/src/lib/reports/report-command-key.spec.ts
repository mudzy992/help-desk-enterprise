import { describe, expect, it, vi } from "vitest";
import { commandKeyFor, releaseCommandKey } from "@/lib/reports/report-command-key";

/**
 * W7.106 (`BA-reports-16`): „send now” carries one `Idempotency-Key` per intent. These tests pin the rule that
 * makes a retry safe and a deliberate second send possible.
 */
describe("report command keys (BA-reports-16)", () => {
  it("mints one key and reuses it for every retry of the same intent", () => {
    const cache = new Map<string, string>();
    const mint = vi.fn(() => "run-now-1");

    expect(commandKeyFor(cache, "sch-1", mint)).toBe("run-now-1");
    expect(commandKeyFor(cache, "sch-1", mint)).toBe("run-now-1");
    // A retry after an error must not mint a new key — that would turn one intent into two reports.
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("keeps schedules apart", () => {
    const cache = new Map<string, string>();
    const keys = ["run-now-a", "run-now-b"];

    expect(commandKeyFor(cache, "sch-1", () => keys[0]!)).toBe("run-now-a");
    expect(commandKeyFor(cache, "sch-2", () => keys[1]!)).toBe("run-now-b");
  });

  it("mints a fresh key after the previous command was answered", () => {
    const cache = new Map<string, string>();
    const mint = vi.fn().mockReturnValueOnce("run-now-1").mockReturnValueOnce("run-now-2");

    commandKeyFor(cache, "sch-1", mint);
    releaseCommandKey(cache, "sch-1");

    expect(commandKeyFor(cache, "sch-1", mint)).toBe("run-now-2");
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("releasing an unknown schedule is harmless", () => {
    const cache = new Map<string, string>();
    expect(() => releaseCommandKey(cache, "nope")).not.toThrow();
    expect(cache.size).toBe(0);
  });
});
