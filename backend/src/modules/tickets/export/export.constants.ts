export const ticketExportMaxRows = 5000;

export const ticketExportContentType = 'text/csv; charset=utf-8';

export const ticketExportColumns = [
  'ticketNumber',
  'title',
  'status',
  'priority',
  'impact',
  'urgency',
  'service',
  'originUnit',
  'handlerGroup',
  'assignee',
  'requester',
  'createdAt',
  'updatedAt',
  'resolvedAt',
  'closedAt',
  'slaOverdue',
] as const;

export type TicketExportColumn = (typeof ticketExportColumns)[number];
