/** Paket 2.3 (R1): connector port — Microsoft Graph and IMAP implement it. */
export type InboundMailboxItem = {
  /** Connector-specific stable id (Graph message id, IMAP `UIDVALIDITY:UID`). */
  readonly providerMessageId: string;
  readonly raw: Buffer;
};

export type InboundMailboxDestination = 'processed' | 'rejected';

export interface InboundMailboxSession {
  /** Oldest first, at most `limit` messages still in the inbox. */
  list(limit: number): Promise<readonly InboundMailboxItem[]>;
  move(providerMessageId: string, destination: InboundMailboxDestination): Promise<void>;
  close(): Promise<void>;
}

export interface InboundMailboxConnector {
  open(): Promise<InboundMailboxSession>;
}

/** Hard cap for one raw message; larger ones are rejected unread (TOO_LARGE). */
export const inboundMaxRawBytes = 35 * 1024 * 1024;
