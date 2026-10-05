import { TicketsError } from './tickets.error';

/**
 * M8 #3 (val 5): the requested deadline from RAW (`request type -> due date`).
 * It is the requester's wish, not the SLA target, so it is stored as given —
 * except for dates in the past, which are a typo rather than a wish.
 *
 * One minute of slack absorbs clock skew between the client and the server.
 */
const pastToleranceMilliseconds = 60_000;

export function parseTicketDueAt(
  value: string | null,
  now = new Date(),
): Date | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TicketsError('INVALID_DUE_AT');
  }
  if (parsed.getTime() < now.getTime() - pastToleranceMilliseconds) {
    throw new TicketsError('DUE_AT_IN_PAST');
  }
  return parsed;
}
