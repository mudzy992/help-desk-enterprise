export const notificationTypes = {
  ticketCreated: 'ticket.created',
  ticketAssigned: 'ticket.assigned',
  ticketMessage: 'ticket.message',
  ticketResolved: 'ticket.resolved',
  ticketClosed: 'ticket.closed',
  ticketApproval: 'ticket.approval',
  ticketSla: 'ticket.sla',
} as const;

export type NotificationType =
  (typeof notificationTypes)[keyof typeof notificationTypes];

export const notificationTitleKeys: Readonly<Record<NotificationType, string>> =
  {
    [notificationTypes.ticketCreated]: 'notifications.items.ticketCreated',
    [notificationTypes.ticketAssigned]: 'notifications.items.ticketAssigned',
    [notificationTypes.ticketMessage]: 'notifications.items.ticketMessage',
    [notificationTypes.ticketResolved]: 'notifications.items.ticketResolved',
    [notificationTypes.ticketClosed]: 'notifications.items.ticketClosed',
    [notificationTypes.ticketApproval]: 'notifications.items.ticketApproval',
    [notificationTypes.ticketSla]: 'notifications.items.ticketSla',
  };

export const notificationListLimits = {
  default: 30,
  maximum: 50,
} as const;
