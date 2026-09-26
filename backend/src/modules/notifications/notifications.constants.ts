export const notificationTypes = {
  ticketCreated: 'ticket.created',
  ticketAssigned: 'ticket.assigned',
  ticketMessage: 'ticket.message',
  ticketResolved: 'ticket.resolved',
  ticketClosed: 'ticket.closed',
  ticketApproval: 'ticket.approval',
  ticketSla: 'ticket.sla',
  remoteRequested: 'remote.requested',
  ticketForwarded: 'ticket.forwarded',
  knowledgeReviewDue: 'knowledge.reviewDue',
  // Package 1.3: only a timer ended by the maximum-duration guard notifies its owner.
  ticketTimeAutoStopped: 'ticket.timeAutoStopped',
  // Package 1.7 (U2): unrouted past the cleanup deadline, and the Monday digest.
  ticketUnroutedOverdue: 'ticket.unroutedOverdue',
  ticketUnroutedDigest: 'ticket.unroutedDigest',
  // Paket 1.8: a directory sync stopped by the deactivation safeguard.
  directorySyncAborted: 'directory.syncAborted',
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
    [notificationTypes.remoteRequested]: 'notifications.items.remoteRequested',
    [notificationTypes.ticketForwarded]: 'notifications.items.ticketForwarded',
    [notificationTypes.knowledgeReviewDue]:
      'notifications.items.knowledgeReviewDue',
    [notificationTypes.ticketTimeAutoStopped]:
      'notifications.items.ticketTimeAutoStopped',
    [notificationTypes.ticketUnroutedOverdue]:
      'notifications.items.ticketUnroutedOverdue',
    [notificationTypes.ticketUnroutedDigest]:
      'notifications.items.ticketUnroutedDigest',
    [notificationTypes.directorySyncAborted]:
      'notifications.items.directorySyncAborted',
  };

export const notificationListLimits = {
  default: 30,
  maximum: 50,
} as const;
