export const defaultTicketReopenConfiguration = {
  enabled: true,
  windowDays: 7,
} as const;

export const ticketReopenConstants = {
  maximumCommentLength: 2000,
} as const;

export const reopenableTicketStatuses = ['RESOLVED', 'CLOSED'] as const;
