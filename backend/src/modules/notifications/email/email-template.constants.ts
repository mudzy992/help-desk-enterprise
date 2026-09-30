export const emailTemplateKeys = [
  'ticket.created',
  'ticket.assigned',
  'ticket.message',
  'ticket.resolved',
  'ticket.closed',
  'ticket.approval',
  'ticket.sla',
  'remote.requested',
  'ticket.forwarded',
  // Paket 2.4
  'ticket.mentioned',
  'ticket.broadcast',
  'user.temporary_password',
  // Paket 2.2: daily digest / quiet-hours summary.
  'notification.digest',
  // Paket 2.2a: weekly list of an agent's open tickets.
  'report.weekly_tickets',
  // Paket 2.5: scheduled report (KPI tables, CSV attachments).
  'report.scheduled',
  // Paket 2.6: privacy notices to administrators (no ticket card).
  'privacy.retention_weekly',
  'privacy.erasure_completed',
  'report.schedule_paused',
  // Paket 2.7: operational alarm (no ticket card).
  'ops.alert',
  // Paket 2.9 (K2b): announcement to its audience, and the acknowledgement reminder.
  'announcement.published',
  'announcement.reminder',
  // Paket 3.2 (§10): daily list of expiring warranties, contracts and licences.
  'asset.expiring',
] as const;

export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

/** Keys about a ticket: rendered with the ticket card, link and threading. */
export const ticketEmailTemplateKeys: readonly EmailTemplateKey[] = emailTemplateKeys.filter(
  (key) =>
    key !== 'user.temporary_password' &&
    key !== 'notification.digest' &&
    key !== 'report.weekly_tickets' &&
    key !== 'report.scheduled' &&
    key !== 'privacy.retention_weekly' &&
    key !== 'privacy.erasure_completed' &&
    key !== 'report.schedule_paused' &&
    key !== 'ops.alert' &&
    key !== 'announcement.published' &&
    key !== 'announcement.reminder' &&
    key !== 'asset.expiring',
);

export const emailLocales = ['bs', 'en'] as const;
export type EmailLocale = (typeof emailLocales)[number];

export const emailTemplateFields = [
  'subject',
  'subjectConfidential',
  'heading',
  'body',
  'cta',
  'footer',
  'accentColor',
] as const;
export type EmailTemplateField = (typeof emailTemplateFields)[number];

export const emailTemplatePlaceholders = [
  'ticketNumber',
  'ticketTitle',
  'ticketId',
  'ticketUrl',
  'ticketDescription',
  'ticketDescriptionShort',
  'type',
  'event',
  'recipientName',
  'serviceName',
  'statusLabel',
  'priorityLabel',
  'groupName',
  'actorName',
  'appName',
  'displayName',
  'email',
  'temporaryPassword',
  'loginUrl',
  'itemCount',
  'ticketCount',
  'overdueCount',
  'weekLabel',
  // Paket 2.5
  'reportName',
  'reportPeriod',
  'reportScope',
  // Paket 2.9 (K2b)
  'announcementTitle',
  'announcementBody',
  'announcementSeverity',
  'announcementPeriod',
] as const;

export type EmailTemplatePlaceholder =
  (typeof emailTemplatePlaceholders)[number];


export const emailDeliveryStatuses = {
  claimed: 'CLAIMED',
  sent: 'SENT',
} as const;

export type EmailDeliveryStatus =
  (typeof emailDeliveryStatuses)[keyof typeof emailDeliveryStatuses];

export const emailReplyModes = ['no_reply', 'shared_mailbox'] as const;
export type EmailReplyMode = (typeof emailReplyModes)[number];

export const emailProviders = ['o365', 'gmail', 'smtp'] as const;
export type EmailProvider = (typeof emailProviders)[number];

/** Presets fill host/port/TLS only when the admin left the host empty. */
export const emailProviderPresets: Readonly<
  Record<Exclude<EmailProvider, 'smtp'>, { host: string; port: number; tls: boolean }>
> = {
  o365: { host: 'smtp.office365.com', port: 587, tls: true },
  gmail: { host: 'smtp.gmail.com', port: 587, tls: true },
};

export const emailMessageExcerptMaxLength = 600;
/** `{{ticketDescriptionShort}}` vs `{{ticketDescription}}` (full, still capped). */
export const emailDescriptionShortMaxLength = 300;
export const emailDescriptionFullMaxLength = 4000;
export const defaultEmailAccentColor = '#4f46e5';
