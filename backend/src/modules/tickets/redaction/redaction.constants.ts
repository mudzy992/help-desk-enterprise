export const redactionModes = ['warn_only', 'soft_block'] as const;
export type RedactionMode = (typeof redactionModes)[number];

export const redactionFieldKeys = [
  'ticket_title',
  'ticket_description',
  'chat_message',
] as const;
export type RedactionFieldKey = (typeof redactionFieldKeys)[number];

export const redactionRiskLevels = ['standard', 'high'] as const;
export type RedactionRisk = (typeof redactionRiskLevels)[number];

export const redactedContentPlaceholder = '[REDACTED]';

export const defaultRedactionPatterns = [
  {
    id: 'password_assignment',
    source: '(password|lozinka|passwd)\\s*[:=]\\s*\\S+',
    flags: 'i',
    risk: 'high',
  },
  {
    id: 'api_key_assignment',
    source: '(api[_-]?key|secret[_-]?key|access[_-]?token)\\s*[:=]\\s*\\S+',
    flags: 'i',
    risk: 'high',
  },
  {
    id: 'bearer_token',
    source: 'bearer\\s+[A-Za-z0-9._\\-]{16,}',
    flags: 'i',
    risk: 'high',
  },
  {
    id: 'private_key_block',
    source: '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    flags: '',
    risk: 'high',
  },
  {
    id: 'aws_access_key',
    source: 'AKIA[0-9A-Z]{16}',
    flags: '',
    risk: 'high',
  },
] as const;

export const defaultTicketRedactionConfiguration = {
  enabled: true,
  mode: 'warn_only' as RedactionMode,
  applyToFields: redactionFieldKeys,
  patterns: defaultRedactionPatterns,
} as const;
