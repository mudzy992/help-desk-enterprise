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
  maxPageSize: 100,
} as const;
