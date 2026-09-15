import { describe, expect, it } from "vitest";
import {
  formatSlaDayHours,
  formatSlaHolidayDate,
  formatSlaHourLabel,
} from "@/lib/sla/format-sla-week-hours";

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
  it("formats an ISO date without timezone shift", () => {
    expect(formatSlaHolidayDate("2026-01-01", "en")).toMatch(/Jan/);
  });
});
