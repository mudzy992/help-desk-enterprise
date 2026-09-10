import { serviceAvailabilityConstants } from './service-availability.constants';
import { ServiceCatalogError } from './service-catalog.error';

export function normalizeDowntimeMessage(value: string): string {
  const message = value.trim();
  if (
    message.length === 0 ||
    message.length > serviceAvailabilityConstants.maximumMessageLength
  ) {
    throw new ServiceCatalogError('INVALID_DOWNTIME_MESSAGE');
  }
  return message;
}
