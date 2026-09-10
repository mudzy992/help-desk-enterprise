import { serviceAvailabilityConstants } from './service-availability.constants';
import { ServiceCatalogError } from './service-catalog.error';

export function normalizeChangeReason(input: {
  readonly reason: string | undefined;
  readonly required: boolean;
  readonly fallback: string;
}): string {
  const reason = input.reason?.trim() ?? '';
  if (input.required && reason.length === 0) {
    throw new ServiceCatalogError('REASON_REQUIRED');
  }
  if (reason.length === 0) {
    return input.fallback;
  }
  if (reason.length > serviceAvailabilityConstants.maximumReasonLength) {
    throw new ServiceCatalogError('REASON_REQUIRED');
  }
  return reason;
}
