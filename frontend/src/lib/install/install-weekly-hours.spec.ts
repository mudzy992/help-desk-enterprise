import { describe, expect, it } from "vitest";
import {
  hasWorkingDay,
  isSameInstallWeeklyHours,
  toInstallWeekdayRows,
  toInstallWeeklyHours,
  type InstallWeekdayRow,
} from "@/lib/install/install-weekly-hours";

/*
  F4.4: the wizard edits one interval per day, the calendar may hold several. The
  conversion has to survive that difference — a split shift that somebody typed in
  Settings may not be dropped because the wizard only shows the first interval.
*/
const standardWeek = {
  "1": [{ start: "08:00", end: "16:00" }],
  "2": [{ start: "08:00", end: "16:00" }],
  "3": [
    { start: "07:30", end: "15:30" },
    { start: "17:00", end: "19:00" },
  ],
  "4": [],
} as const;

describe("install weekly hours", () => {
  it("shows the first interval of every day and keeps the rest aside", () => {
    const rows = toInstallWeekdayRows(standardWeek);
    const wednesday = rows.find((row) => row.day === "3");

    expect(rows).toHaveLength(7);
    expect(wednesday).toMatchObject({ isOpen: true, start: "07:30", end: "15:30" });
    expect(wednesday?.extraIntervals).toEqual([{ start: "17:00", end: "19:00" }]);
    // A day the calendar lists as empty is closed, not "08:00–16:00".
    expect(rows.find((row) => row.day === "4")?.isOpen).toBe(false);
    expect(rows.find((row) => row.day === "6")?.isOpen).toBe(false);
  });

  it("writes the extra intervals back untouched", () => {
    const rows = toInstallWeekdayRows(standardWeek);
    const edited = rows.map((row) => (row.day === "3" ? { ...row, start: "08:00" } : row));

    expect(toInstallWeeklyHours(edited)["3"]).toEqual([
      { start: "08:00", end: "15:30" },
      { start: "17:00", end: "19:00" },
    ]);
    expect(toInstallWeeklyHours(edited)["6"]).toEqual([]);
  });

  it("says which week has no working day at all", () => {
    const rows = toInstallWeekdayRows(standardWeek);
    const closed = rows.map((row) => ({ ...row, isOpen: false }));
    const oneDay: readonly InstallWeekdayRow[] = closed.map((row) =>
      row.day === "5" ? { ...row, isOpen: true } : row,
    );

    expect(hasWorkingDay(rows)).toBe(true);
    expect(hasWorkingDay(closed)).toBe(false);
    expect(hasWorkingDay(oneDay)).toBe(true);
  });

  it("treats a reordered copy of the same week as unchanged", () => {
    expect(
      isSameInstallWeeklyHours(
        standardWeek,
        toInstallWeeklyHours(toInstallWeekdayRows(standardWeek)),
      ),
    ).toBe(true);
    expect(
      isSameInstallWeeklyHours(standardWeek, {
        ...standardWeek,
        "1": [{ start: "09:00", end: "17:00" }],
      }),
    ).toBe(false);
  });
});
