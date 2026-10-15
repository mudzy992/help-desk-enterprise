import { describe, expect, it } from "vitest";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";

describe("createLatestRequestGuard", () => {
  it("only accepts the newest request", () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    guard.cancel();
    expect(guard.isCurrent(second)).toBe(false);
  });
});
