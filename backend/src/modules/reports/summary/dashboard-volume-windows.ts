import {
  civilDateOf,
  civilDayKey,
  startOfCivilDate,
  type CivilDate,
} from "./start-of-civil-day";

export const dashboardVolumeDayCount = 14;

export type DashboardVolumeWindow = {
  readonly key: string;
  readonly start: Date;
  readonly end: Date;
};

function shiftCivilDate(civil: CivilDate, days: number): CivilDate {
  const shifted = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function dashboardVolumeWindows(
  now: Date,
  timeZone: string,
): readonly DashboardVolumeWindow[] {
  const today = civilDateOf(now, timeZone);
  return Array.from({ length: dashboardVolumeDayCount }, (_, index) => {
    const civil = shiftCivilDate(today, index - (dashboardVolumeDayCount - 1));
    const next = shiftCivilDate(civil, 1);
    const start = startOfCivilDate(civil, timeZone);
    return {
      key: civilDayKey(start, timeZone),
      start,
      end: startOfCivilDate(next, timeZone),
    };
  });
}
