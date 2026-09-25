import {
  toTicketCountsSearchParams,
  type TicketCountsQuery,
} from "@/lib/tickets/ticket-list-search-params";
import { apiRequest } from "@/services/api";
import type { TicketStatus } from "@/services/tickets-api";

export type { TicketCountsQuery };

export type TicketCounts = {
  /** Visible tickets that are not resolved, closed or archived. */
  readonly open: number;
  readonly unrouted: number;
  /** Size of the caller's group inbox; not narrowed by the filters. */
  readonly inbox: number;
  /** The tickets `GET /tickets?overdue=true` lists. */
  readonly overdue: number;
  /** The tickets `GET /tickets?atRisk=true` lists. */
  readonly atRisk: number;
  /** Paket 1.7 (U3): `GET /tickets?unroutedOverdue=true`; absent on older APIs. */
  readonly unroutedOverdue?: number;
  /** Cleanup deadline in hours behind `unroutedOverdue`; 0 = disabled. */
  readonly unroutedCleanupHours?: number;
  readonly byStatus: Readonly<Record<TicketStatus, number>>;
};

/**
 * Counts computed on the server over the tickets the caller may list, so the
 * badge and the list it opens agree. Pass the list's narrowing filters to get
 * tab counters that follow them.
 */
export function getTicketCounts(
  query: TicketCountsQuery = {},
): Promise<TicketCounts> {
  const search = toTicketCountsSearchParams(query).toString();
  return apiRequest(`/tickets/counts${search === "" ? "" : `?${search}`}`);
}
