import { findReplyToken, findThreadRootTicketId } from '../notifications/email/reply-token';
import type { InboundMessage } from './inbound-email.types';

export type InboundTarget =
  | { readonly kind: 'token'; readonly ticketId: string; readonly recipientId: string }
  | { readonly kind: 'thread'; readonly ticketId: string }
  | { readonly kind: 'subject'; readonly ticketNumber: string }
  | { readonly kind: 'new' };

const subjectNumber = /\[(T-\d{4,})\]/i;

/** Paket 2.3 (R4): token → thread root → [T-…] in the subject → new e-mail. */
export function resolveInboundTarget(message: InboundMessage, secret: Buffer | null): InboundTarget {
  const threadHeaders = [message.inReplyTo ?? '', ...message.references];
  const token = findReplyToken(threadHeaders, secret);
  if (token !== null) return { kind: 'token', ...token };
  const threadTicketId = findThreadRootTicketId(threadHeaders);
  if (threadTicketId !== null) return { kind: 'thread', ticketId: threadTicketId };
  const number = subjectNumber.exec(message.subject)?.[1];
  if (number !== undefined) return { kind: 'subject', ticketNumber: number.toUpperCase() };
  return { kind: 'new' };
}
