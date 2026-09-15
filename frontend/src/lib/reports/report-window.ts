export const reportPresets = ["15d", "30d", "6m", "12m", "custom"] as const;

export type ReportPreset = (typeof reportPresets)[number];

export type ReportWindow = {
  readonly from: Date;
  readonly to: Date;
};

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addLocalMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveReportWindow(input: {
  readonly preset: ReportPreset;
  readonly customFrom: string;
  readonly customTo: string;
  readonly now: Date;
}): ReportWindow {
  if (input.preset === "custom") {
    const custom = customWindow(input.customFrom, input.customTo);
    if (custom !== null) {
      return custom;
    }
  }
  return rollingWindow(
    input.preset === "custom" ? "30d" : input.preset,
    input.now,
  );
}

export function previousReportWindow(window: ReportWindow): ReportWindow {
  const durationMs = window.to.getTime() - window.from.getTime();
  return {
    from: new Date(window.from.getTime() - durationMs),
    to: new Date(window.from.getTime() - 1),
  };
}

export function isTimestampInWindow(
  isoTimestamp: string | null | undefined,
  window: ReportWindow,
): boolean {
  if (isoTimestamp === null || isoTimestamp === undefined) {
    return false;
  }
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const time = parsed.getTime();
  return time >= window.from.getTime() && time <= window.to.getTime();
}

export function enumerateLocalDays(window: ReportWindow): readonly Date[] {
  const days: Date[] = [];
  let cursor = startOfLocalDay(window.from);
  const last = startOfLocalDay(window.to);
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return days;
}

function customWindow(fromValue: string, toValue: string): ReportWindow | null {
  const from = parseDateInputValue(fromValue);
  const to = parseDateInputValue(toValue);
  if (from === null || to === null) {
    return null;
  }
  const start = startOfLocalDay(from);
  const end = endOfLocalDay(to);
  if (start.getTime() <= end.getTime()) {
    return { from: start, to: end };
  }
  return { from: startOfLocalDay(to), to: endOfLocalDay(from) };
}

function rollingWindow(
  preset: Exclude<ReportPreset, "custom">,
  now: Date,
): ReportWindow {
  const startToday = startOfLocalDay(now);
  if (preset === "15d") {
    return { from: addLocalDays(startToday, -14), to: now };
  }
  if (preset === "30d") {
    return { from: addLocalDays(startToday, -29), to: now };
  }
  if (preset === "6m") {
    return { from: addLocalMonths(startToday, -6), to: now };
  }
  return { from: addLocalMonths(startToday, -12), to: now };
}
