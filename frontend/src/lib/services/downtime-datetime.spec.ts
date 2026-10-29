import { describe, expect, it } from "vitest";
import {
  browserTimeZone,
  formatInstantInZone,
  fromDatetimeLocalValue,
  isValidCivilRange,
  toDatetimeLocalValue,
} from "@/lib/services/downtime-datetime";

describe("civil-time contract", () => {
  it("round-trips a browser-zone civil value through an ISO instant", () => {
    const value = "2026-01-15T10:30";
    const instant = fromDatetimeLocalValue(value);
    expect(instant).not.toBeNull();
    expect(toDatetimeLocalValue(instant as string)).toBe(value);
    expect(browserTimeZone()).not.toBe("");
  });

  it("rejects malformed and impossible civil values", () => {
    expect(fromDatetimeLocalValue("2026-02-30T10:00")).toBeNull();
    expect(fromDatetimeLocalValue("not-a-date")).toBeNull();
  });

  it("renders one instant on the recipient wall clock in different IANA zones", () => {
    const instant = "2026-07-15T10:00:00.000Z";
    expect(formatInstantInZone(instant, "en-GB", "Europe/Sarajevo")).toContain("12:00");
    expect(formatInstantInZone(instant, "en-GB", "America/New_York")).toContain("06:00");
  });

  it("formats instants across a DST jump without inventing the skipped civil hour", () => {
    expect(formatInstantInZone("2026-03-29T00:30:00.000Z", "en-GB", "Europe/Sarajevo")).toContain(
      "01:30",
    );
    expect(formatInstantInZone("2026-03-29T01:30:00.000Z", "en-GB", "Europe/Sarajevo")).toContain(
      "03:30",
    );
  });

  it("requires an increasing instant range, including cross-day ranges", () => {
    expect(isValidCivilRange("2026-10-24T23:30", "2026-10-25T01:00")).toBe(true);
    expect(isValidCivilRange("2026-10-25T01:00", "2026-10-25T01:00")).toBe(false);
    expect(isValidCivilRange("2026-10-25T02:00", "2026-10-25T01:00")).toBe(false);
  });
});
