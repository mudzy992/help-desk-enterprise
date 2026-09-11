export const defaultTicketSavedViewsConfiguration = {
  enabled: true,
  maxPerUser: 20,
  allowDefaultView: true,
  allowSharing: false,
} as const;

export const ticketSavedViewConstants = {
  maximumNameLength: 80,
  maximumSearchLength: 200,
} as const;

export const savedViewSortFields = [
  'updatedAt',
  'createdAt',
  'priority',
  'status',
] as const;

export const savedViewColumnKeys = [
  'number',
  'subject',
  'status',
  'priority',
  'service',
  'assignment',
  'updated',
] as const;
