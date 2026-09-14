import { reportErrorCodes } from './reports.constants';
import { ReportsError } from './reports.error';
import type { ReportWindow } from './reports.types';

export function resolveReportWindow(input: {
  readonly from?: string;
  readonly to?: string;
  readonly now: Date;
  readonly defaultWindowDays: number;
  readonly mode: 'month' | 'rolling';
}): ReportWindow {
  if (input.from !== undefined || input.to !== undefined) {
    return explicitWindow(input.from, input.to, input.now, input.defaultWindowDays);
  }
  if (input.mode === 'month') {
    return {
      from: new Date(
        Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1),
      ),
      to: input.now,
    };
  }
  return {
    from: addUtcDays(input.now, -input.defaultWindowDays),
    to: input.now,
  };
}

export function isTimestampInWindow(
  value: Date | null,
  window: ReportWindow,
): boolean {
  if (value === null) {
    return false;
  }
  const time = value.getTime();
  return time >= window.from.getTime() && time <= window.to.getTime();
}

export function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function enumerateUtcDateKeys(window: ReportWindow): readonly string[] {
  const keys: string[] = [];
  let cursor = Date.UTC(
    window.from.getUTCFullYear(),
    window.from.getUTCMonth(),
    window.from.getUTCDate(),
  );
  const end = Date.UTC(
    window.to.getUTCFullYear(),
    window.to.getUTCMonth(),
    window.to.getUTCDate(),
  );
  while (cursor <= end) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return keys;
}

function explicitWindow(
  from: string | undefined,
  to: string | undefined,
  now: Date,
  defaultWindowDays: number,
): ReportWindow {
  const resolvedTo = to === undefined ? now : parseInstant(to);
  const resolvedFrom =
    from === undefined
      ? addUtcDays(resolvedTo, -defaultWindowDays)
      : parseInstant(from);
  if (resolvedFrom.getTime() > resolvedTo.getTime()) {
    throw new ReportsError(reportErrorCodes.windowInvalid);
  }
  return { from: resolvedFrom, to: resolvedTo };
}

function parseInstant(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ReportsError(reportErrorCodes.windowInvalid);
  }
  return parsed;
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}
