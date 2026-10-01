import { describe, expect, it } from "vitest";
import { buildMonthGrid, dayKey, freezeOn, overlapsDay, shiftMonth } from "@/lib/changes/change-calendar";

describe("buildMonthGrid", () => {
  it("starts on Monday and ends on Sunday, covering the month", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const grid = buildMonthGrid({ year: 2026, month: 9 });
    expect(dayKey(grid.weeks[0]![0]!)).toBe("2026-09-28");
    const lastWeek = grid.weeks[grid.weeks.length - 1]!;
    expect(dayKey(lastWeek[6]!)).toBe("2026-11-01");
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(dayKey(grid.to)).toBe("2026-11-02");
  });

  it("never exceeds six weeks", () => {
    for (let month = 0; month < 12; month += 1) {
      expect(buildMonthGrid({ year: 2027, month }).weeks.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("calendar helpers", () => {
  it("shifts across years", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("detects overlap with a local day", () => {
    const day = new Date(2026, 9, 5);
    expect(overlapsDay(day, new Date(2026, 9, 5, 22).toISOString(), new Date(2026, 9, 6, 2).toISOString())).toBe(true);
    expect(overlapsDay(day, new Date(2026, 9, 6, 0).toISOString(), new Date(2026, 9, 6, 2).toISOString())).toBe(false);
  });

  it("treats freeze dates as inclusive", () => {
    const periods = [{ from: "2026-12-24", to: "2027-01-02", label: "Year end" }];
    expect(freezeOn(new Date(2027, 0, 2), periods)?.label).toBe("Year end");
    expect(freezeOn(new Date(2027, 0, 3), periods)).toBeNull();
  });
});
