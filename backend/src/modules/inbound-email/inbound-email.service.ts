import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { resolveEmailLocale } from '../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { loadEmailChannelConfiguration, type EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { readReplyTokenVerificationSecrets } from '../notifications/email/reply-token';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../notifications/notifications.constants';
import { SettingsService } from '../settings/settings.service';
import { TicketsAttachmentsService } from '../tickets/attachments/tickets-attachments.service';
import { TicketsReopenService } from '../tickets/reopen/tickets-reopen.service';
import { ticketConstants } from '../tickets/tickets.constants';
import { TicketsError } from '../tickets/tickets.error';
import { TicketsCollaborationService } from '../tickets/tickets-collaboration.service';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketMutationContext } from '../tickets/tickets.types';
import { composeInboundNoticeEmail } from './compose-inbound-notice-email';
import {
  inboundConfigurationProblems,
  inboundMailboxKey,
  loadInboundEmailConfiguration,
  type InboundEmailConfiguration,
} from './inbound-email-configuration';
import type { InboundOutcome } from './inbound-email.types';
import { InboundRawStore } from './inbound-raw-store';
import { createInboundMailbox } from './mailbox/create-inbound-mailbox';
import type { InboundMailboxConnector, InboundMailboxItem, InboundMailboxSession } from './mailbox/inbound-mailbox';
import { parseInboundMessage } from './parse-inbound-message';
import {
  InboundTicketError,
  processInboundMessage,
  type InboundProcessingPorts,
  type InboundSender,
  type InboundTicket,
} from './process-inbound-message';

export const inboundEmailLimits = {
  /** A message that keeps failing for technical reasons is parked after this many runs. */
  maxAttempts: 3,
  /** Consecutive connector failures before admins get one in-app alert. */
  alertAfterFailures: 3,
  /** Backoff ceiling for a failing connector. */
  maxBackoffSeconds: 30 * 60,
  retentionBatch: 500,
} as const;

export type InboundRunResult =
  | { readonly kind: 'disabled' | 'not_due' }
  | { readonly kind: 'misconfigured'; readonly problems: readonly string[] }
  | { readonly kind: 'failed'; readonly error: string }
  | { readonly kind: 'ran'; readonly processed: number; readonly rejected: number; readonly ignored: number; readonly failed: number };

const finalStatuses = new Set(['PROCESSED', 'REJECTED', 'IGNORED']);

/** Ticket module errors arrive either raw or mapped to an HTTP exception. */
function ticketErrorCode(error: unknown): string | null {
  if (error instanceof TicketsError) return error.code;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null && 'code' in response) {
      return String((response as { code: unknown }).code);
    }
  }
  return null;
}

async function asTicketError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = ticketErrorCode(error);
    if (code !== null) throw new InboundTicketError(code);
    throw error;
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 500);
}

/**
 * Paket 2.3 (§7): reads the support mailbox and turns replies into ticket
 * messages. Runs only in the worker; one pass at a time (BullMQ concurrency 1).
 */
@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger('InboundEmail');
  private readonly rawStore = new InboundRawStore();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly tickets: TicketsService,
    private readonly collaboration: TicketsCollaborationService,
    private readonly attachments: TicketsAttachmentsService,
    private readonly reopen: TicketsReopenService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  /** Connector factory seam for tests. */
  protected createConnector(configuration: InboundEmailConfiguration): InboundMailboxConnector {
    return createInboundMailbox(configuration);
  }

  async runDue(now = new Date()): Promise<InboundRunResult> {
    const configuration = await loadInboundEmailConfiguration(this.settings);
    if (!configuration.enabled) return { kind: 'disabled' };
    const mailboxKey = inboundMailboxKey(configuration);
    const state = await this.prisma.inboundMailboxState.findUnique({ where: { mailboxKey } });
    if (state?.lastRunAt != null) {
      const backoff = Math.min(
        configuration.pollSeconds * 2 ** Math.min(state.consecutiveFails, 10),
        Math.max(inboundEmailLimits.maxBackoffSeconds, configuration.pollSeconds),
      );
      // A few seconds of slack so a 60 s schedule is not skipped by timer jitter.
      if (now.getTime() - state.lastRunAt.getTime() < backoff * 1000 - 5000) return { kind: 'not_due' };
    }
    const problems = inboundConfigurationProblems(configuration);
    if (problems.length > 0) {
      await this.recordFailure(mailboxKey, `MISCONFIGURED ${problems.join(',')}`, now);
      return { kind: 'misconfigured', problems };
    }
    return this.runOnce(configuration, now);
  }

  async runOnce(configuration: InboundEmailConfiguration, now = new Date()): Promise<InboundRunResult> {
    const mailboxKey = inboundMailboxKey(configuration);
    let session: InboundMailboxSession | null = null;
    const counts = { processed: 0, rejected: 0, ignored: 0, failed: 0 };
    try {
      session = await this.createConnector(configuration).open();
      const items = await session.list(configuration.maxMessagesPerRun);
      const email = await loadEmailChannelConfiguration(this.settings);
      for (const item of items) {
        const status = await this.handleItem(configuration, email, mailboxKey, session, item, now);
        if (status === 'PROCESSED') counts.processed += 1;
        else if (status === 'REJECTED') counts.rejected += 1;
        else if (status === 'IGNORED') counts.ignored += 1;
        else if (status === 'FAILED') counts.failed += 1;
      }
    } catch (error) {
      const message = errorText(error);
      this.logger.warn(`inbound_email_run_failed mailbox=${mailboxKey} reason=${message}`);
      await this.recordFailure(mailboxKey, message, now);
      return { kind: 'failed', error: message };
    } finally {
      await session?.close().catch(() => undefined);
    }
    await this.prisma.inboundMailboxState.upsert({
      where: { mailboxKey },
      create: { mailboxKey, lastRunAt: now, lastSuccessAt: now },
      update: { lastRunAt: now, lastSuccessAt: now, consecutiveFails: 0, alertedAt: null },
    });
    if (counts.processed + counts.rejected + counts.ignored + counts.failed > 0) {
      this.logger.log(
        `inbound_email_processed=${counts.processed} inbound_email_rejected=${counts.rejected} inbound_email_ignored=${counts.ignored} inbound_email_failed=${counts.failed}`,
      );
    }
    return { kind: 'ran', ...counts };
  }

  /** R14: drop old originals and old log rows. */
  async applyRetention(now = new Date()): Promise<{ readonly rawRemoved: number; readonly rowsRemoved: number }> {
    const configuration = await loadInboundEmailConfiguration(this.settings);
    const rawCutoff = new Date(now.getTime() - configuration.rawRetentionDays * 86_400_000);
    let rawRemoved = 0;
    for (;;) {
      const rows = await this.prisma.inboundEmail.findMany({
        where: { rawStorageKey: { not: null }, createdAt: { lt: rawCutoff } },
        select: { id: true, rawStorageKey: true },
        take: inboundEmailLimits.retentionBatch,
      });
      if (rows.length === 0) break;
      for (const row of rows) if (row.rawStorageKey !== null) await this.rawStore.remove(row.rawStorageKey);
      await this.prisma.inboundEmail.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { rawStorageKey: null } });
      rawRemoved += rows.length;
      if (rows.length < inboundEmailLimits.retentionBatch) break;
    }
    // Month folders a full month past the window (files of deleted rows, crashes).
    await this.rawStore.pruneMonthsBefore(new Date(rawCutoff.getTime() - 31 * 86_400_000));
    const rowCutoff = new Date(now.getTime() - configuration.metadataRetentionDays * 86_400_000);
    const deleted = await this.prisma.inboundEmail.deleteMany({ where: { createdAt: { lt: rowCutoff } } });
    return { rawRemoved, rowsRemoved: deleted.count };
  }

  private async handleItem(
    configuration: InboundEmailConfiguration,
    email: EmailChannelConfiguration,
    mailboxKey: string,
    session: InboundMailboxSession,
    item: InboundMailboxItem,
    now: Date,
  ): Promise<string> {
    const existing = await this.prisma.inboundEmail.findUnique({
      where: { mailboxKey_providerMessageId: { mailboxKey, providerMessageId: item.providerMessageId } },
    });
    if (existing !== null && finalStatuses.has(existing.status)) {
      // R12: decided before a crash, only the move is missing.
      await session.move(item.providerMessageId, existing.status === 'PROCESSED' ? 'processed' : 'rejected');
      return 'SKIPPED';
    }
    if (existing !== null && existing.status === 'PROCESSING') {
      // A pass died mid-message; the reply may already be on the ticket, so it is never replayed.
      await this.prisma.inboundEmail.update({ where: { id: existing.id }, data: { status: 'FAILED', reason: 'INTERRUPTED' } });
      await session.move(item.providerMessageId, 'rejected');
      return 'FAILED';
    }
    if (existing !== null && existing.attempts >= inboundEmailLimits.maxAttempts) {
      await session.move(item.providerMessageId, 'rejected');
      return 'SKIPPED';
    }
    const row =
      existing === null
        ? await this.prisma.inboundEmail
            .create({ data: { mailboxKey, providerMessageId: item.providerMessageId.slice(0, 500), subject: '', status: 'PROCESSING' } })
            .catch(() => null)
        : await this.prisma.inboundEmail.update({
            where: { id: existing.id },
            data: { status: 'PROCESSING', attempts: { increment: 1 }, reason: null },
          });
    if (row === null) return 'SKIPPED'; // another worker claimed it

    try {
      if (item.raw.length === 0) {
        return await this.finish(session, item, row.id, { status: 'REJECTED', reason: 'TOO_LARGE' });
      }
      const rawStorageKey = configuration.rawRetentionDays > 0 ? await this.rawStore.save(row.id, item.raw, now).catch(() => null) : null;
      let message;
      try {
        message = await parseInboundMessage(item.raw);
      } catch {
        await this.prisma.inboundEmail.update({ where: { id: row.id }, data: { rawStorageKey } });
        return await this.finish(session, item, row.id, { status: 'REJECTED', reason: 'PARSE_FAILED' });
      }
      await this.prisma.inboundEmail.update({
        where: { id: row.id },
        data: {
          rawStorageKey,
          messageIdHeader: message.messageId?.slice(0, 500) ?? null,
          fromAddress: message.fromAddress?.slice(0, 320) ?? null,
          subject: message.subject.slice(0, 200),
          receivedAt: message.receivedAt,
        },
      });
      // R12: the same e-mail delivered twice (To + Cc, re-sent by a rule).
      if (message.messageId !== null) {
        const duplicate = await this.prisma.inboundEmail.findFirst({
          where: { mailboxKey, messageIdHeader: message.messageId.slice(0, 500), status: 'PROCESSED', id: { not: row.id } },
          select: { id: true },
        });
        if (duplicate !== null) return await this.finish(session, item, row.id, { status: 'IGNORED', reason: 'DUPLICATE' });
      }
      const ownAddresses = [configuration.address, email.smtp?.fromAddress ?? '', email.presentation.replyToAddress ?? '']
        .map((address) => address.trim().toLowerCase())
        .filter((address) => address.length > 0);
      const outcome = await processInboundMessage(message, this.ports(configuration, email, row.id), {
        ownAddresses,
        replyTokenSecret: readReplyTokenVerificationSecrets(),
        requireAuthPass: configuration.requireAuthPass,
        recipientPolicy: email,
        maxPerSenderPerHour: configuration.maxPerSenderPerHour,
        createTickets: configuration.createTickets,
        maxBodyLength: ticketConstants.maximumMessageBodyLength,
        now,
      });
      return await this.finish(session, item, row.id, outcome);
    } catch (error) {
      const reason = errorText(error);
      this.logger.warn(`inbound_email_message_failed id=${row.id} reason=${reason}`);
      await this.prisma.inboundEmail
        .update({ where: { id: row.id }, data: { status: 'FAILED', reason: reason.slice(0, 64) } })
        .catch(() => undefined);
      // Left in the inbox for the next pass, unless it has used up its attempts.
      if (row.attempts >= inboundEmailLimits.maxAttempts) await session.move(item.providerMessageId, 'rejected').catch(() => undefined);
      return 'FAILED';
    }
  }

  private async finish(session: InboundMailboxSession, item: InboundMailboxItem, id: string, outcome: InboundOutcome): Promise<string> {
    await this.prisma.inboundEmail.update({
      where: { id },
      data: {
        status: outcome.status,
        reason: outcome.status === 'PROCESSED' ? (outcome.notes?.length ? 'ATTACHMENTS_REJECTED' : null) : outcome.reason,
        ticketId: 'ticketId' in outcome ? (outcome.ticketId ?? null) : null,
        ticketMessageId: outcome.status === 'PROCESSED' ? (outcome.ticketMessageId ?? null) : null,
        createdTicketId: outcome.status === 'PROCESSED' ? (outcome.createdTicketId ?? null) : null,
      },
    });
    await session.move(item.providerMessageId, outcome.status === 'PROCESSED' ? 'processed' : 'rejected');
    return outcome.status;
  }

  private ports(configuration: InboundEmailConfiguration, email: EmailChannelConfiguration, inboundId: string): InboundProcessingPorts {
    const context = (actorUserId: string): TicketMutationContext => ({ actorUserId, messageSource: 'EMAIL' });
    const ticketSelect = { id: true, ticketNumber: true, status: true, mergedIntoTicketId: true } as const;
    return {
      findSenderByEmail: async (address) =>
        this.prisma.user.findFirst({
          where: { email: { equals: address, mode: 'insensitive' } },
          select: { id: true, email: true, isActive: true },
        }),
      findTicketById: async (ticketId) => this.prisma.ticket.findUnique({ where: { id: ticketId }, select: ticketSelect }),
      findTicketByNumber: async (ticketNumber) =>
        this.prisma.ticket.findUnique({ where: { ticketNumber }, select: ticketSelect }),
      countRecentFromSender: async (address, since) =>
        this.prisma.inboundEmail.count({
          where: { fromAddress: address, createdAt: { gte: since }, id: { not: inboundId }, status: { not: 'IGNORED' } },
        }),
      addReply: async (ticketId, senderId, body) =>
        asTicketError(async () => {
          // R6: the requester writes a user reply, staff a public agent reply — never an internal note.
          try {
            return { messageId: (await this.collaboration.createMessage(ticketId, { type: 'USER_REPLY', body }, context(senderId))).id };
          } catch (error) {
            if (ticketErrorCode(error) !== 'MESSAGE_TYPE_NOT_ALLOWED') throw error;
            return { messageId: (await this.collaboration.createMessage(ticketId, { type: 'AGENT_REPLY', body }, context(senderId))).id };
          }
        }),
      reopenWithReply: async (ticketId, senderId, body) =>
        asTicketError(async () => {
          const startedAt = new Date();
          await this.reopen.reopen(ticketId, { comment: body }, context(senderId));
          // The reopen comment is the e-mail text: label it like any e-mail reply (R15).
          const message = await this.prisma.ticketMessage.findFirst({
            where: { ticketId, authorUserId: senderId, createdAt: { gte: startedAt }, type: { not: 'SYSTEM_EVENT' } },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          });
          if (message === null) return { messageId: null };
          await this.prisma.ticketMessage.update({ where: { id: message.id }, data: { source: 'EMAIL' } });
          return { messageId: message.id };
        }),
      attach: async (ticketId, senderId, attachment) => {
        await asTicketError(() =>
          this.attachments.upload(
            ticketId,
            {
              originalName: attachment.filename,
              declaredMimeType: attachment.contentType,
              size: attachment.size,
              buffer: attachment.content,
            },
            context(senderId),
          ),
        );
      },
      noteRejectedAttachment: async (ticketId, filename, reason) => {
        await this.prisma.ticketMessage.create({
          data: {
            ticketId,
            type: 'SYSTEM_EVENT',
            body: `inbound_attachment_rejected:${filename.replace(/[\r\n:]/g, ' ').slice(0, 200)}|${reason}`,
            authorUserId: null,
            source: 'EMAIL',
          },
        });
      },
      createTicket: async (senderId, title, description) =>
        asTicketError(async () => {
          const created = await this.tickets.create(
            { title, description, impact: 'MEDIUM', urgency: 'MEDIUM', serviceId: configuration.defaultServiceId },
            context(senderId),
          );
          return { ticketId: (created as { id: string }).id };
        }),
      sendNotice: async (kind, sender, ticket) => this.sendNotice(email, kind, sender, ticket),
    };
  }

  /** R7/R8: one short answer per sender, ticket, kind and day (the delivery claim is the limiter). */
  private async sendNotice(email: EmailChannelConfiguration, kind: 'ticket_closed' | 'reply_blocked', sender: InboundSender, ticket: InboundTicket) {
    if (!email.deliveryEnabled || email.smtp === null) return;
    const user = await this.prisma.user.findUnique({ where: { id: sender.id }, select: { preferredLocale: true } });
    const locale = resolveEmailLocale(user?.preferredLocale ?? null, email);
    const publicUrl = email.presentation.publicUrl;
    const composed = composeInboundNoticeEmail({
      kind,
      locale,
      ticketNumber: ticket.ticketNumber,
      url: publicUrl === null ? null : kind === 'ticket_closed' ? `${publicUrl}/tickets/new` : `${publicUrl}/tickets/${encodeURIComponent(ticket.id)}`,
    });
    const day = new Date().toISOString().slice(0, 10);
    await deliverNotificationEmail(this.prisma, this.mailTransport, email, {
      userId: sender.id,
      toAddress: sender.email,
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
      headers: composed.headers,
      templateKey: `inbound.${kind}`,
      dedupeKey: `inbound:${kind}:${ticket.id}:${day}`,
    }).catch((error: unknown) => this.logger.warn(`inbound_email_notice_failed reason=${errorText(error)}`));
  }

  private async recordFailure(mailboxKey: string, error: string, now: Date): Promise<void> {
    const state = await this.prisma.inboundMailboxState.upsert({
      where: { mailboxKey },
      create: { mailboxKey, lastRunAt: now, lastError: error, lastErrorAt: now, consecutiveFails: 1 },
      update: { lastRunAt: now, lastError: error, lastErrorAt: now, consecutiveFails: { increment: 1 } },
    });
    if (state.consecutiveFails < inboundEmailLimits.alertAfterFailures || state.alertedAt !== null) return;
    await this.prisma.inboundMailboxState.update({ where: { mailboxKey }, data: { alertedAt: now } });
    const admins = await this.prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: { some: { role: { key: { in: [authorizationRoleKeys.superAdmin, authorizationRoleKeys.admin] } } } },
      },
      select: { id: true },
    });
    for (const admin of admins) {
      await persistInAppNotification(this.prisma, {
        userId: admin.id,
        type: notificationTypes.inboundMailboxFailing,
        title: 'notifications.items.inboundMailboxFailing',
        body: error.slice(0, 200),
        ticketId: null,
        payload: {
          ticketId: '',
          ticketNumber: '',
          event: notificationTypes.inboundMailboxFailing,
          messageId: `inbound-failing:${mailboxKey}:${now.toISOString()}`,
          actorUserId: null,
          confidential: false,
        },
        dedupeKey: `inbound-failing:${mailboxKey}:${now.toISOString().slice(0, 10)}:${admin.id}`,
      }).catch(() => null);
    }
  }
}
