/**
 * Paket 1.8: minimal 5-field cron matcher (minute hour day month weekday) with
 * `*`, lists, ranges and steps, evaluated in a time zone. Enough for the
 * directory schedule; avoids depending on a transitive cron library.
 */
const ranges: readonly [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

export function parseCronField(field: string, index: number): Set<number> | null {
  const [minimum, maximum] = ranges[index];
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number.parseInt(stepPart, 10);
    if (!Number.isInteger(step) || step <= 0) return null;
    let start = minimum;
    let end = maximum;
    if (rangePart !== '*') {
      const [from, to] = rangePart.split('-').map((value) => Number.parseInt(value, 10));
      if (!Number.isInteger(from)) return null;
      start = from;
      end = to === undefined ? (stepPart === undefined ? from : maximum) : to;
      if (!Number.isInteger(end) || start < minimum || end > maximum || start > end) return null;
    }
    for (let value = start; value <= end; value += step) {
      values.add(index === 4 && value === 7 ? 0 : value);
    }
  }
  return values;
}

export function cronMatches(expression: string, date: Date, timeZone: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    minute: 'numeric',
    hour: 'numeric',
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const actual = [
    Number.parseInt(read('minute'), 10),
    Number.parseInt(read('hour'), 10),
    Number.parseInt(read('day'), 10),
    Number.parseInt(read('month'), 10),
    weekdays.indexOf(read('weekday')),
  ];
  return fields.every((field, index) => parseCronField(field, index)?.has(actual[index]) === true);
}

/** True when the expression fires at some minute in (from, to]. */
export function cronFiredBetween(expression: string, from: Date, to: Date, timeZone: string): boolean {
  const minute = 60_000;
  let cursor = Math.floor(from.getTime() / minute) * minute + minute;
  const limit = Math.min(to.getTime(), from.getTime() + 24 * 60 * minute);
  for (; cursor <= limit; cursor += minute) {
    if (cronMatches(expression, new Date(cursor), timeZone)) return true;
  }
  return false;
}
