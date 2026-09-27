import { reportErrorCodes } from '../reports.constants';
import { ReportsError } from '../reports.error';
import {
  addCivilDays,
  addCivilMonths,
  civilDayKey,
  civilDayOf,
  compareCivilDays,
  isoWeekday,
  startOfCivilDayInstant,
  type CivilDay,
} from './civil-calendar';
import {
  reportTrendAutoGranularity,
  reportTrendBucketLimits,
  reportTrendDefaults,
  type ReportTrendGranularity,
} from './report-trends.constants';

export type ReportTrendBucket = {
  /** Civil date the bucket starts on (`YYYY-MM-DD`, report time zone). */
  readonly key: string;
  readonly start: Date;
  /** Exclusive. */
  readonly end: Date;
  /** The bucket is still running (its end is in the future). */
  readonly partial: boolean;
};

export type ReportTrendBucketPlan = {
  readonly granularity: ReportTrendGranularity;
  readonly buckets: readonly ReportTrendBucket[];
  /** Same number of buckets right before the first one (period-over-period). */
  readonly previous: { readonly start: Date; readonly end: Date };
};

/**
 * Paket 2.5 (design §3): the buckets of a trend request, aligned to the civil
 * calendar of the report time zone — days, ISO weeks (Monday) or months. The
 * SQL layer only ever receives these instants, so the time zone and DST logic
 * lives here, in one tested place, and never in SQL.
 */
export function buildReportTrendBuckets(input: {
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: ReportTrendGranularity;
  readonly timeZone: string;
  readonly now: Date;
  readonly maxMonths: number;
}): ReportTrendBucketPlan {
  const today = civilDayOf(input.now, input.timeZone);
  let toDay = input.to === undefined ? today : parseCivilDay(input.to, input.timeZone);
  if (compareCivilDays(toDay, today) > 0) {
    toDay = today;
  }
  const fromDay =
    input.from === undefined
      ? addCivilMonths(firstOfMonth(toDay), -(reportTrendDefaults.defaultWindowMonths - 1))
      : parseCivilDay(input.from, input.timeZone);
  if (compareCivilDays(fromDay, toDay) > 0) {
    throw new ReportsError(reportErrorCodes.windowInvalid);
  }
  const granularity = input.granularity ?? autoGranularity(fromDay, toDay);
  const limit = granularity === 'month' ? input.maxMonths : reportTrendBucketLimits[granularity];
  const starts: CivilDay[] = [];
  let cursor = alignDown(fromDay, granularity);
  while (compareCivilDays(cursor, toDay) <= 0) {
    starts.push(cursor);
    if (starts.length > limit) {
      throw new ReportsError(reportErrorCodes.windowInvalid);
    }
    cursor = nextStart(cursor, granularity);
  }
  const boundaries = [...starts, cursor].map((day) => startOfCivilDayInstant(day, input.timeZone));
  const buckets = starts.map((day, index) => ({
    key: civilDayKey(day),
    start: boundaries[index] as Date,
    end: boundaries[index + 1] as Date,
    partial: (boundaries[index + 1] as Date).getTime() > input.now.getTime(),
  }));
  let previousStart = starts[0] as CivilDay;
  for (let index = 0; index < starts.length; index += 1) {
    previousStart = previousStartOf(previousStart, granularity);
  }
  return {
    granularity,
    buckets,
    previous: {
      start: startOfCivilDayInstant(previousStart, input.timeZone),
      end: boundaries[0] as Date,
    },
  };
}

export function autoGranularity(fromDay: CivilDay, toDay: CivilDay): ReportTrendGranularity {
  const days =
    (Date.UTC(toDay.year, toDay.month - 1, toDay.day) -
      Date.UTC(fromDay.year, fromDay.month - 1, fromDay.day)) /
      86_400_000 +
    1;
  if (days <= reportTrendAutoGranularity.dayMaxDays) return 'day';
  if (days <= reportTrendAutoGranularity.weekMaxDays) return 'week';
  return 'month';
}

/** `YYYY-MM-DD` is a civil date as written; a full instant is read in the zone. */
export function parseCivilDay(value: string, timeZone: string): CivilDay {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain !== null) {
    const day = { year: Number(plain[1]), month: Number(plain[2]), day: Number(plain[3]) };
    const check = new Date(Date.UTC(day.year, day.month - 1, day.day));
    if (check.getUTCMonth() + 1 !== day.month || check.getUTCDate() !== day.day) {
      throw new ReportsError(reportErrorCodes.windowInvalid);
    }
    return day;
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new ReportsError(reportErrorCodes.windowInvalid);
  }
  return civilDayOf(instant, timeZone);
}

function firstOfMonth(day: CivilDay): CivilDay {
  return { year: day.year, month: day.month, day: 1 };
}

function alignDown(day: CivilDay, granularity: ReportTrendGranularity): CivilDay {
  if (granularity === 'month') return firstOfMonth(day);
  if (granularity === 'week') return addCivilDays(day, 1 - isoWeekday(day));
  return day;
}

function nextStart(day: CivilDay, granularity: ReportTrendGranularity): CivilDay {
  if (granularity === 'month') return addCivilMonths(day, 1);
  return addCivilDays(day, granularity === 'week' ? 7 : 1);
}

function previousStartOf(day: CivilDay, granularity: ReportTrendGranularity): CivilDay {
  if (granularity === 'month') return addCivilMonths(day, -1);
  return addCivilDays(day, granularity === 'week' ? -7 : -1);
}
