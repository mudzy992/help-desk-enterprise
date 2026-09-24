import { ticketListPaging } from './list-tickets.constants';

/**
 * Page size of every ticket list read (phase 1.1, plan §1.1).
 *
 * A missing value means "the default page" (25) and anything larger than
 * `ticketListPaging.maxPageSize` (50) is clamped instead of rejected, so an old
 * client asking for 200 rows still gets a valid, bounded answer.
 */
export function clampTicketListPageSize(pageSize: number | undefined): number {
  return Math.min(
    Math.max(pageSize ?? ticketListPaging.defaultPageSize, 1),
    ticketListPaging.maxPageSize,
  );
}
