import { ServiceCatalogError } from './service-catalog.error';

export function parseDowntimeInstant(value: Date | string): Date {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new ServiceCatalogError('INVALID_DOWNTIME_RANGE');
  }
  return instant;
}

export function compareDowntimeInstants(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}
