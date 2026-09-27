/** Paket 2.3: known outcome reasons and configuration problems (i18n keys). */
export const inboundReasonKeys = [
  "UNKNOWN_SENDER",
  "SENDER_INACTIVE",
  "SENDER_DOMAIN_NOT_ALLOWED",
  "AUTHENTICATION_FAILED",
  "NO_TICKET_MATCH",
  "TICKET_NOT_FOUND",
  "FORBIDDEN",
  "TICKET_CLOSED",
  "EMPTY_REPLY",
  "REDACTION_BLOCKED",
  "RATE_LIMITED",
  "TOO_LARGE",
  "CREATE_FAILED",
  "PARSE_FAILED",
  "AUTO_REPLY",
  "BOUNCE",
  "MAILING_LIST",
  "OWN_MESSAGE",
  "DUPLICATE",
  "INTERRUPTED",
  "ATTACHMENTS_REJECTED",
  "OTHER",
] as const;
export type InboundReasonKey = (typeof inboundReasonKeys)[number];

export const inboundProblemKeys = [
  "ADDRESS_MISSING",
  "ENTRA_APP_MISSING",
  "IMAP_SERVER_MISSING",
  "IMAP_PASSWORD_MISSING",
  "DEFAULT_SERVICE_MISSING",
] as const;
export type InboundProblemKey = (typeof inboundProblemKeys)[number];

export function toInboundReasonKey(reason: string | null): InboundReasonKey | null {
  if (reason === null || reason.length === 0) return null;
  return (inboundReasonKeys as readonly string[]).includes(reason) ? (reason as InboundReasonKey) : "OTHER";
}

export function toInboundProblemKeys(problems: readonly string[]): InboundProblemKey[] {
  return problems.filter((problem): problem is InboundProblemKey =>
    (inboundProblemKeys as readonly string[]).includes(problem),
  );
}
