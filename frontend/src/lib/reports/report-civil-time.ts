export type CivilParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
  readonly minuteOfDay: number;
};

const weekdays: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatters.get(timeZone);
  if (value === undefined) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, value);
  }
  return value;
}

function rawParts(date: Date, timeZone: string) {
  const values: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(date)) values[part.type] = part.value;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: weekdays[values.weekday ?? "Sun"] ?? 0,
  };
}

export function civilParts(date: Date, timeZone: string): CivilParts {
  const parts = rawParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    minuteOfDay: parts.hour * 60 + parts.minute,
  };
}

function offsetMilliseconds(date: Date, timeZone: string): number {
  const parts = rawParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Mirrors the server's Intl-only civil-time conversion, including DST gaps. */
export function zonedInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  const first = guess - offsetMilliseconds(new Date(guess), timeZone);
  return new Date(guess - offsetMilliseconds(new Date(first), timeZone));
}

export function addCivilDays(parts: CivilParts, days: number): CivilParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    ...parts,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

export function addCivilMonths(parts: CivilParts, months: number): CivilParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  return {
    ...parts,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: 1,
    weekday: date.getUTCDay(),
  };
}
