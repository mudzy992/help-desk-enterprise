import { describe, expect, it } from "vitest";
import {
  formatSlaDayHours,
  formatSlaHolidayDate,
  formatSlaHourLabel,
} from "@/lib/sla/format-sla-week-hours";
import { fakeDateTranslator } from "@/lib/format-civil-date.spec";

describe("formatSlaHourLabel", () => {
  it("drops whole-hour minutes", () => {
    expect(formatSlaHourLabel("08:00")).toBe("08");
    expect(formatSlaHourLabel("16:00")).toBe("16");
  });

  it("keeps non-zero minutes", () => {
    expect(formatSlaHourLabel("08:30")).toBe("08:30");
  });
});

describe("formatSlaDayHours", () => {
  it("returns null when the weekday is closed", () => {
    expect(formatSlaDayHours({ "1": [{ start: "08:00", end: "16:00" }] }, "6")).toBeNull();
  });

  it("joins intervals from weeklyHours", () => {
    expect(
      formatSlaDayHours(
        { "1": [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "16:00" }] },
        "1",
      ),
    ).toBe("08–12, 13–16");
  });
});

describe("formatSlaHolidayDate", () => {
  // Prije: `Intl.DateTimeFormat(locale, { dateStyle: "medium" })` → u runtimeu
  // bez bosanskih CLDR podataka ispadne „2026 M1 1“.
  it("formats an ISO date without timezone shift", () => {
    expect(formatSlaHolidayDate("2026-01-01", fakeDateTranslator("en"))).toBe("January 1, 2026");
    expect(formatSlaHolidayDate("2026-01-01", fakeDateTranslator("bs"))).toBe("1. januar 2026.");
  });

  it("keeps the original value when the date is not parseable", () => {
    expect(formatSlaHolidayDate("nije-datum", fakeDateTranslator("bs"))).toBe("nije-datum");
  });
});
