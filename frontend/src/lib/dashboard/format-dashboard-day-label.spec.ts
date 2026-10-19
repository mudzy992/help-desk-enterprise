import { describe, expect, it } from "vitest";
import { formatDashboardDayLabel } from "@/lib/dashboard/format-dashboard-day-label";

describe("formatDashboardDayLabel", () => {
  it("formats a civil day without exposing a browser-specific year", () => {
    const date = new Date(2026, 9, 6, 12, 0, 0);
    expect(formatDashboardDayLabel(date, "bs")).toBe("06. 10");
    expect(formatDashboardDayLabel(date, "en")).toBe("06. 10");
  });
});
