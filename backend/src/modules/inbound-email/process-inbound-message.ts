import {
  isAllowedNotificationEmailAddress,
  type NotificationEmailRecipientPolicy,
} from '../notifications/email/is-allowed-notification-email-address';
import { checkSenderAuthentication } from './check-sender-authentication';
import { detectAutoReply } from './detect-auto-reply';
import { cleanSubject, extractReplyText } from './extract-reply-text';
import type { InboundAttachment, InboundMessage, InboundOutcome, InboundRejectReason } from './inbound-email.types';
import { resolveInboundTarget } from './resolve-inbound-target';

export type InboundSender = {
  readonly id: string;
  readonly email: string;
  readonly isActive: boolean;
};

export type InboundTicket = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly status: string;
  readonly mergedIntoTicketId: string | null;
};

export type InboundNoticeKind = 'ticket_closed' | 'reply_blocked';

/** Thrown by the ticket port with the ticket module error code. */
export class InboundTicketError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Everything the processing step needs from the outside world. */
export type InboundProcessingPorts = {
  findSenderByEmail(address: string): Promise<InboundSender | null>;
  findTicketById(ticketId: string): Promise<InboundTicket | null>;
  findTicketByNumber(ticketNumber: string): Promise<InboundTicket | null>;
  countRecentFromSender(address: string, since: Date): Promise<number>;
  addReply(ticketId: string, senderId: string, body: string): Promise<{ readonly messageId: string }>;
  reopenWithReply(ticketId: string, senderId: string, body: string): Promise<{ readonly messageId: string | null }>;
  attach(ticketId: string, senderId: string, attachment: InboundAttachment): Promise<void>;
  noteRejectedAttachment(ticketId: string, filename: string, reason: string): Promise<void>;
  createTicket(senderId: string, title: string, description: string): Promise<{ readonly ticketId: string }>;
  sendNotice(kind: InboundNoticeKind, sender: InboundSender, ticket: InboundTicket): Promise<void>;
};

export type InboundProcessingOptions = {
  readonly ownAddresses: readonly string[];
  readonly replyTokenSecret: Buffer | null;
  readonly requireAuthPass: boolean;
  readonly recipientPolicy: NotificationEmailRecipientPolicy;
  readonly maxPerSenderPerHour: number;
  readonly createTickets: boolean;
  readonly maxBodyLength: number;
  readonly now: Date;
};

const closedStatuses = new Set(['CLOSED', 'ARCHIVED']);
const reopenStatuses = new Set(['RESOLVED']);
/** Signature logos and tracking pixels: inline and tiny. */
const inlineSkipBytes = 10 * 1024;
const maxMergeHops = 3;
const titleMaxLength = 200;

const reject = (reason: InboundRejectReason, ticketId?: string): InboundOutcome =>
  ticketId === undefined ? { status: 'REJECTED', reason } : { status: 'REJECTED', reason, ticketId };

function mapTicketErrorCode(code: string): InboundRejectReason {
  if (code === 'REDACTION_BLOCKED') return 'REDACTION_BLOCKED';
  if (code === 'NOT_FOUND') return 'TICKET_NOT_FOUND';
  if (code === 'INVALID_MESSAGE_BODY') return 'EMPTY_REPLY';
  if (code === 'TICKET_NOT_EDITABLE' || code.startsWith('REOPEN_')) return 'TICKET_CLOSED';
  return 'FORBIDDEN';
}

function attachmentList(attachments: readonly InboundAttachment[]): string {
  return attachments.map((attachment) => `📎 ${attachment.filename}`).join('\n');
}

/**
 * Paket 2.3 (§7): one parsed e-mail → outcome. Pure orchestration over ports
 * so every rule (R4–R11) is unit-testable without a mailbox or a database.
 */
export async function processInboundMessage(
  message: InboundMessage,
  ports: InboundProcessingPorts,
  options: InboundProcessingOptions,
): Promise<InboundOutcome> {
  const ignored = detectAutoReply(message, options.ownAddresses);
  if (ignored !== null) return { status: 'IGNORED', reason: ignored };
  const from = message.fromAddress;
  if (from === null || from.length === 0) return reject('UNKNOWN_SENDER');

  const hourAgo = new Date(options.now.getTime() - 3_600_000);
  if ((await ports.countRecentFromSender(from, hourAgo)) >= options.maxPerSenderPerHour) return reject('RATE_LIMITED');
  if (options.requireAuthPass && checkSenderAuthentication(message) !== 'pass') return reject('AUTHENTICATION_FAILED');
  if (!isAllowedNotificationEmailAddress(from, options.recipientPolicy)) return reject('SENDER_DOMAIN_NOT_ALLOWED');

  const sender = await ports.findSenderByEmail(from);
  if (sender === null) return reject('UNKNOWN_SENDER');
  if (!sender.isActive) return reject('SENDER_INACTIVE');

  const attachments = message.attachments.filter((attachment) => !(attachment.inline && attachment.size < inlineSkipBytes));
  const text = extractReplyText(message.text, options.maxBodyLength);

  const target = resolveInboundTarget(message, options.replyTokenSecret);
  if (target.kind === 'new') {
    if (!options.createTickets) return reject('NO_TICKET_MATCH');
    const title = (cleanSubject(message.subject) || text.split('\n')[0] || '').slice(0, titleMaxLength).trim();
    const description = text.length > 0 ? text : attachmentList(attachments);
    if (title.length === 0 || description.length === 0) return reject('EMPTY_REPLY');
    let created: { readonly ticketId: string };
    try {
      created = await ports.createTicket(sender.id, title, description);
    } catch (error) {
      if (error instanceof InboundTicketError) return reject('CREATE_FAILED');
      throw error;
    }
    const notes = await attachAll(ports, created.ticketId, sender.id, attachments);
    return { status: 'PROCESSED', ticketId: created.ticketId, createdTicketId: created.ticketId, notes };
  }

  let ticket =
    target.kind === 'subject' ? await ports.findTicketByNumber(target.ticketNumber) : await ports.findTicketById(target.ticketId);
  // Package 1.2 (M7): a merged child is answered on its parent.
  for (let hop = 0; ticket !== null && ticket.mergedIntoTicketId !== null && hop < maxMergeHops; hop += 1) {
    ticket = await ports.findTicketById(ticket.mergedIntoTicketId);
  }
  if (ticket === null) return reject('TICKET_NOT_FOUND');

  const body = text.length > 0 ? text : attachmentList(attachments);
  if (body.length === 0) return reject('EMPTY_REPLY', ticket.id);

  if (closedStatuses.has(ticket.status)) {
    await ports.sendNotice('ticket_closed', sender, ticket);
    return reject('TICKET_CLOSED', ticket.id);
  }

  let messageId: string | null;
  try {
    messageId = reopenStatuses.has(ticket.status)
      ? (await ports.reopenWithReply(ticket.id, sender.id, body)).messageId
      : (await ports.addReply(ticket.id, sender.id, body)).messageId;
  } catch (error) {
    if (!(error instanceof InboundTicketError)) throw error;
    const reason = mapTicketErrorCode(error.code);
    if (reason === 'TICKET_CLOSED') await ports.sendNotice('ticket_closed', sender, ticket);
    if (reason === 'REDACTION_BLOCKED') await ports.sendNotice('reply_blocked', sender, ticket);
    return reject(reason, ticket.id);
  }
  const notes = await attachAll(ports, ticket.id, sender.id, attachments);
  return {
    status: 'PROCESSED',
    ticketId: ticket.id,
    ...(messageId === null ? {} : { ticketMessageId: messageId }),
    notes,
  };
}

/** R10: every attachment goes through the normal upload checks; failures become a note. */
async function attachAll(
  ports: InboundProcessingPorts,
  ticketId: string,
  senderId: string,
  attachments: readonly InboundAttachment[],
): Promise<string[]> {
  const notes: string[] = [];
  for (const attachment of attachments) {
    try {
      await ports.attach(ticketId, senderId, attachment);
    } catch (error) {
      const reason = error instanceof InboundTicketError ? error.code : 'UPLOAD_FAILED';
      notes.push(`${attachment.filename}:${reason}`);
      await ports.noteRejectedAttachment(ticketId, attachment.filename, reason).catch(() => undefined);
    }
  }
  return notes;
}
