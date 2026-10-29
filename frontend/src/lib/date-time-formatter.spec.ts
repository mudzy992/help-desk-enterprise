import { beforeEach, describe, expect, it } from "vitest";
import {
  applicationDateLocale,
  dateTimeFormatter,
  resetDateTimeFormatterCacheForTests,
} from "@/lib/date-time-formatter";

describe("dateTimeFormatter", () => {
  beforeEach(resetDateTimeFormatterCacheForTests);
  it("reuses an equivalent formatter", () => {
    expect(dateTimeFormatter("bs-BA", { dateStyle: "short" })).toBe(
      dateTimeFormatter("bs-BA", { dateStyle: "short" }),
    );
  });

  it("normalizes supported interface languages to one regional date contract", () => {
    expect(applicationDateLocale("en-US")).toBe("en-GB");
    expect(applicationDateLocale("bs")).toBe("bs-BA");
  });
});
