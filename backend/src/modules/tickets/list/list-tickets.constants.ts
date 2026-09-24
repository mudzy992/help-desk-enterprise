export const ticketListSortFields = [
  'updatedAt',
  'createdAt',
  'priority',
  'status',
  'slaDueAt',
] as const;

export const ticketListSortDirections = ['asc', 'desc'] as const;

export const ticketListPaging = {
  defaultPage: 1,
  defaultPageSize: 25,
  /**
   * Phase 1.1 (plan §1.1): no list read may return more than 50 rows, so a
   * single client can never pull the ticket table into a browser again.
   */
  maxPageSize: 50,
} as const;
