/**
 * Page reads of `GET /tickets`.
 *
 * The helper itself lives in `tickets-api.ts` (next to the other ticket calls);
 * this module stays as the thin entry point the older imports used, so the
 * change of home did not have to touch every caller.
 */
export { listTicketsPage } from "@/services/tickets-api";
export type { TicketPage } from "@/services/tickets-api";
export type { TicketPageQuery } from "@/lib/tickets/ticket-list-search-params";
