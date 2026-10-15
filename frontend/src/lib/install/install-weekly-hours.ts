/**
 * Install wizard v2 (F4.4): the SLA review edits the seeded `BH_STANDARD` week.
 * The calendar allows several intervals per day (a split shift), the wizard shows
 * one — so the editor keeps the extra intervals untouched and writes them back
 * instead of quietly dropping what somebody typed in Settings.
 */
export const installWeekdays = ["1", "2", "3", "4", "5", "6", "7"] as const;

export type InstallWeekday = (typeof installWeekdays)[number];

export type InstallWeekdayInterval = {
  readonly start: string;
  readonly end: string;
};

export type InstallWeeklyHours = Readonly<
  Record<string, readonly InstallWeekdayInterval[] | undefined>
>;

export type InstallWeekdayRow = {
  readonly day: InstallWeekday;
  readonly isOpen: boolean;
  readonly start: string;
  readonly end: string;
  /** Intervals after the first one, shown read-only and written back as they are. */
  readonly extraIntervals: readonly InstallWeekdayInterval[];
};

export const installDefaultInterval = { start: "08:00", end: "16:00" } as const;

export function toInstallWeekdayRows(
  weeklyHours: InstallWeeklyHours,
): readonly InstallWeekdayRow[] {
  return installWeekdays.map((day) => {
    const intervals = weeklyHours[day] ?? [];
    const first = intervals[0];
    return {
      day,
      isOpen: first !== undefined,
      start: first?.start ?? installDefaultInterval.start,
      end: first?.end ?? installDefaultInterval.end,
      extraIntervals: intervals.slice(1),
    };
  });
}

export function toInstallWeeklyHours(rows: readonly InstallWeekdayRow[]): InstallWeeklyHours {
  const entries = rows.map((row) => [
    row.day,
    row.isOpen ? [{ start: row.start, end: row.end }, ...row.extraIntervals] : [],
  ]);
  return Object.fromEntries(entries);
}

/** Closed days are the ones the operator turned off; a day may not stay empty. */
export function hasWorkingDay(rows: readonly InstallWeekdayRow[]): boolean {
  return rows.some((row) => row.isOpen);
}

export function isSameInstallWeeklyHours(
  left: InstallWeeklyHours,
  right: InstallWeeklyHours,
): boolean {
  return JSON.stringify(toComparable(left)) === JSON.stringify(toComparable(right));
}

function toComparable(
  weeklyHours: InstallWeeklyHours,
): Readonly<Record<string, readonly InstallWeekdayInterval[]>> {
  const entries = installWeekdays.map((day) => [day, [...(weeklyHours[day] ?? [])]]);
  return Object.fromEntries(entries);
}
