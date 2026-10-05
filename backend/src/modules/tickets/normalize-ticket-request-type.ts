import { ticketConstants } from './tickets.constants';
import { TicketsError } from './tickets.error';

/**
 * M8 #3 (val 5): the explicit request type from RAW (`service -> request type`).
 * Free text, but normalised so " VPN  ne radi " and "VPN ne radi" are one value
 * in reports; an empty or over-long value is refused instead of stored.
 */
export function normalizeTicketRequestType(value: string): string {
  const requestType = value.trim().replace(/\s+/g, ' ');
  if (
    requestType.length === 0 ||
    requestType.length > ticketConstants.maximumRequestTypeLength
  ) {
    throw new TicketsError('INVALID_REQUEST_TYPE');
  }
  return requestType;
}

/** `null` clears the field; an empty string is treated as "cleared" too. */
export function normalizeOptionalTicketRequestType(
  value: string | null,
): string | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }
  return normalizeTicketRequestType(value);
}
