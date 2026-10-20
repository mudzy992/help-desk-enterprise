import { describe, expect, it } from "vitest";
import { numberFormatter, resetNumberFormatterCacheForTests } from "@/lib/number-formatter";

describe("numberFormatter", () => {
  it("reuses equal locale/options contracts", () => {
    resetNumberFormatterCacheForTests();
    const first = numberFormatter("bs-BA", { maximumFractionDigits: 0 });
    const second = numberFormatter("bs-BA", { maximumFractionDigits: 0 });
    expect(second).toBe(first);
    expect(first.format(1234)).not.toBe("");
  });
});
