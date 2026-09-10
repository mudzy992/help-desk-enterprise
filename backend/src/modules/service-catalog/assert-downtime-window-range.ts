import { compareDowntimeInstants } from './parse-downtime-instant';
import { ServiceCatalogError } from './service-catalog.error';

export function assertDowntimeWindowRange(startsAt: Date, endsAt: Date): void {
  if (compareDowntimeInstants(startsAt, endsAt) >= 0) {
    throw new ServiceCatalogError('INVALID_DOWNTIME_RANGE');
  }
}

export function isDowntimeWindowActive(startsAt: Date, endsAt: Date, now: Date): boolean {
  return (
    compareDowntimeInstants(startsAt, now) <= 0 &&
    compareDowntimeInstants(now, endsAt) < 0
  );
}

export function isDowntimeWindowUpcoming(startsAt: Date, now: Date): boolean {
  return compareDowntimeInstants(now, startsAt) < 0;
}

export function isDowntimeWindowExpired(endsAt: Date, now: Date): boolean {
  return compareDowntimeInstants(now, endsAt) >= 0;
}
