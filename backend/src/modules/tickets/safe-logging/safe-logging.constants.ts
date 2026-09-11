export const safeLoggingFieldKeys = [
  'ticket_title',
  'ticket_description',
  'chat_message',
] as const;
export type SafeLoggingFieldKey = (typeof safeLoggingFieldKeys)[number];

export const defaultSafeLoggingLevelsCsv = 'CONFIDENTIAL,RESTRICTED';
export const defaultSafeLoggingRedactFieldsCsv =
  'ticket_title,ticket_description,chat_message';

export const safeLogRedactedPlaceholder = '[REDACTED]';

export const alwaysRedactedLogKeys = [
  'password',
  'passwd',
  'lozinka',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'bindPassword',
  'apiKey',
  'privateKey',
] as const;

export const defaultTicketSafeLoggingConfiguration = {
  enabled: true,
  levels: ['CONFIDENTIAL', 'RESTRICTED'] as readonly string[],
  redactFields: safeLoggingFieldKeys as readonly SafeLoggingFieldKey[],
} as const;
