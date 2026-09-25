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
  'ticket.broadcast',
  'user.temporary_password',
] as const;

export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

/** Keys about a ticket: rendered with the ticket card, link and threading. */
export const ticketEmailTemplateKeys: readonly EmailTemplateKey[] = emailTemplateKeys.filter(
  (key) => key !== 'user.temporary_password',
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
