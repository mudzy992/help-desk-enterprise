import { describe, expect, it } from "vitest";
import { civilParts, zonedInstant } from "@/lib/reports/report-civil-time";

describe("report civil time", () => {
  it("uses the reporting zone instead of the viewer/runtime zone", () => {
    const instant = new Date("2026-01-01T00:30:00Z");
    expect(civilParts(instant, "Europe/Sarajevo")).toMatchObject({ year: 2026, month: 1, day: 1 });
    expect(civilParts(instant, "America/Los_Angeles")).toMatchObject({
      year: 2025,
      month: 12,
      day: 31,
    });
  });

  it("converts civil midnight and preserves wall-clock time across DST", () => {
    expect(zonedInstant("Europe/Sarajevo", 2026, 1, 1, 0)).toEqual(
      new Date("2025-12-31T23:00:00Z"),
    );
    expect(zonedInstant("Europe/Sarajevo", 2026, 3, 30, 7 * 60)).toEqual(
      new Date("2026-03-30T05:00:00Z"),
    );
    expect(zonedInstant("Europe/Sarajevo", 2026, 10, 26, 7 * 60)).toEqual(
      new Date("2026-10-26T06:00:00Z"),
    );
  });
});
