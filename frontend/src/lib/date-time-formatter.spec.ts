import { beforeEach, describe, expect, it } from "vitest";
import { dateTimeFormatter, resetDateTimeFormatterCacheForTests } from "@/lib/date-time-formatter";

describe("dateTimeFormatter", () => {
  beforeEach(resetDateTimeFormatterCacheForTests);
  it("reuses an equivalent formatter", () => {
    expect(dateTimeFormatter("bs-BA", { dateStyle: "short" })).toBe(
      dateTimeFormatter("bs-BA", { dateStyle: "short" }),
    );
  });
});
