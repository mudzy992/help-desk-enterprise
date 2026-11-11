/** Paket 2.3: a parsed inbound e-mail (independent of the mailbox connector). */
export type InboundAttachment = {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly content: Buffer;
  /** Inline part referenced from HTML (`cid:`), typically a signature logo. */
  readonly inline: boolean;
};

export type InboundMessage = {
  readonly messageId: string | null;
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
  readonly fromAddress: string | null;
  readonly fromName: string | null;
  readonly subject: string;
  readonly text: string;
  readonly receivedAt: Date | null;
  /** Lower-cased header name → raw values (multi-valued headers keep all). */
  readonly headers: ReadonlyMap<string, readonly string[]>;
  readonly attachments: readonly InboundAttachment[];
};

export type InboundOutcome =
  | { readonly status: 'PROCESSED'; readonly ticketId: string; readonly ticketMessageId?: string; readonly createdTicketId?: string; readonly notes?: readonly string[] }
  | { readonly status: 'REJECTED'; readonly reason: InboundRejectReason; readonly ticketId?: string }
  | { readonly status: 'IGNORED'; readonly reason: InboundIgnoreReason };

export type InboundRejectReason =
  | 'UNKNOWN_SENDER'
  | 'SENDER_INACTIVE'
  | 'SENDER_DOMAIN_NOT_ALLOWED'
  | 'AUTHENTICATION_FAILED'
  | 'NO_TICKET_MATCH'
  | 'TICKET_NOT_FOUND'
  | 'FORBIDDEN'
  | 'TICKET_CLOSED'
  | 'EMPTY_REPLY'
  | 'REDACTION_BLOCKED'
  | 'RATE_LIMITED'
  | 'TOO_LARGE'
  | 'CREATE_FAILED'
  | 'PARSE_FAILED';

export type InboundIgnoreReason = 'AUTO_REPLY' | 'BOUNCE' | 'MAILING_LIST' | 'OWN_MESSAGE' | 'DUPLICATE';
