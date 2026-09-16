export const emailTemplateKeys = [
  'ticket.created',
  'ticket.assigned',
  'ticket.message',
  'ticket.resolved',
  'ticket.closed',
  'ticket.approval',
  'ticket.sla',
  'remote.requested',
  'user.temporary_password',
] as const;

export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

export const emailTemplatePlaceholders = [
  'ticketNumber',
  'ticketTitle',
  'ticketId',
  'type',
  'event',
  'displayName',
  'email',
  'temporaryPassword',
] as const;

export type EmailTemplatePlaceholder =
  (typeof emailTemplatePlaceholders)[number];

export const internalNotificationEmailDomain = 'epbih.ba';

export const emailDeliveryStatuses = {
  claimed: 'CLAIMED',
  sent: 'SENT',
} as const;

export type EmailDeliveryStatus =
  (typeof emailDeliveryStatuses)[keyof typeof emailDeliveryStatuses];
