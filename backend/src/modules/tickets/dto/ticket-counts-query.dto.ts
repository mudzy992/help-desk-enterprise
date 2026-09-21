import { TicketFilterQueryDto } from './ticket-filter-query.dto';

/**
 * Counts honour the same narrowing filters as the list, so the tab counters of
 * a filtered list stay consistent with it. Status, SLA state, sort and paging
 * are deliberately not accepted: the counts are broken down by them.
 */
export class TicketCountsQueryDto extends TicketFilterQueryDto {}
