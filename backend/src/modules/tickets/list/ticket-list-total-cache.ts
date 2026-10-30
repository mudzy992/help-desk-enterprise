import {
  createPerClientSingleFlightCache,
  readTtlMsFromEnvironment,
} from '../../../common/cache/single-flight-cache';
import type { CappedTicketTotal } from './count-tickets-capped';

/**
 * Shared short-lived count cache for ticket lists and the group inbox. A total
 * may lag behind ticket writes for at most the configured TTL; ticket rows are
 * always queried fresh. The authz/visibility predicate is part of each key.
 */
export function ticketListTotalCacheTtlMs(): number {
  return readTtlMsFromEnvironment(
    'TICKET_LIST_TOTAL_CACHE_TTL_MS',
    process.env.NODE_ENV === 'test' ? 0 : 30_000,
  );
}

export const ticketListTotals =
  createPerClientSingleFlightCache<CappedTicketTotal>({
    ttlMs: ticketListTotalCacheTtlMs,
    maxEntries: 5000,
  });
