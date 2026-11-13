/** Safe, bounded outcome diagnostics for the test's own uniquely correlated mail. */
const statuses = new Set(['PROCESSING', 'PROCESSED', 'REJECTED', 'IGNORED', 'FAILED']);
const reasons = new Set([
  'UNKNOWN_SENDER', 'SENDER_INACTIVE', 'SENDER_DOMAIN_NOT_ALLOWED', 'AUTHENTICATION_FAILED',
  'NO_TICKET_MATCH', 'TICKET_NOT_FOUND', 'FORBIDDEN', 'TICKET_CLOSED', 'EMPTY_REPLY',
  'REDACTION_BLOCKED', 'RATE_LIMITED', 'TOKEN_RECIPIENT_MISMATCH', 'TOO_LARGE', 'CREATE_FAILED',
  'PARSE_FAILED', 'AUTO_REPLY', 'BOUNCE', 'MAILING_LIST', 'OWN_MESSAGE', 'DUPLICATE',
  'INTERRUPTED', 'ATTACHMENTS_REJECTED',
]);

export type InboundDiagnosticRow = {
  readonly status: string;
  readonly reason: string | null;
  readonly message_id_matches: boolean | null;
  readonly subject_matches: boolean;
  readonly has_created_ticket: boolean;
};

export function formatInboundDiagnostics(rows: readonly InboundDiagnosticRow[]): string {
  if (rows.length === 0) return 'No inbound row matched this test message ID or unique subject.';
  return rows.map((row) => [
    `status=${statuses.has(row.status) ? row.status : 'OTHER'}`,
    `reason=${row.reason === null ? 'NONE' : reasons.has(row.reason) ? row.reason : 'OTHER'}`,
    `messageIdMatch=${row.message_id_matches === true}`,
    `subjectMatch=${row.subject_matches === true}`,
    `createdTicket=${row.has_created_ticket === true}`,
  ].join(' ')).join('; ');
}
