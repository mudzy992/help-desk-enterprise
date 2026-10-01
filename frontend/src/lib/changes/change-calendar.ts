import type { ChangeFreezePeriod } from "@/services/changes-api";

/**
 * Paket 3.4 (§17): month grid for the change calendar. Weeks start on Monday;
 * days are local calendar days; the query covers the whole visible grid
 * (at most 42 days, below the 62-day limit of the API).
 */

export type CalendarMonth = { readonly year: number; readonly month: number };

export type CalendarGrid = {
  readonly weeks: readonly (readonly Date[])[];
  readonly from: Date;
  readonly to: Date;
};

export function monthOf(date: Date): CalendarMonth {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth(value: CalendarMonth, delta: number): CalendarMonth {
  const date = new Date(value.year, value.month + delta, 1);
  return monthOf(date);
}

export function buildMonthGrid(value: CalendarMonth): CalendarGrid {
  const first = new Date(value.year, value.month, 1);
  // Monday = 0 ... Sunday = 6.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(value.year, value.month, 1 - offset);
  const last = new Date(value.year, value.month + 1, 0);
  const tail = 6 - ((last.getDay() + 6) % 7);
  const end = new Date(value.year, value.month + 1, tail); // last visible day (Sunday)
  const weeks: Date[][] = [];
  for (let cursor = new Date(start); cursor <= end; ) {
    const week: Date[] = [];
    for (let index = 0; index < 7; index += 1) {
      week.push(new Date(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks, from: start, to: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) };
}

/** Local "YYYY-MM-DD" of a day. */
export function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** An interval [start, end) touches the local day. */
export function overlapsDay(day: Date, start: string, end: string): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return Date.parse(start) < dayEnd && Date.parse(end) > dayStart;
}

/** Freeze dates are inclusive calendar days. */
export function freezeOn(day: Date, periods: readonly ChangeFreezePeriod[]): ChangeFreezePeriod | null {
  const key = dayKey(day);
  return periods.find((period) => period.from <= key && key <= period.to) ?? null;
}

export function isSameDay(left: Date, right: Date): boolean {
  return dayKey(left) === dayKey(right);
}
