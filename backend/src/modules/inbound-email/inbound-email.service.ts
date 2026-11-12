import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { claimInboundEmailAttempt, normalizeInboundProviderMessageId } from './inbound-email-attempt';
import type { InboundEmailAttemptSnapshot } from './inbound-email-attempt';
import { inboundEmailIdempotencyKey } from './inbound-email-idempotency';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
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
  type InboundPersistedResult,
  type InboundProcessingPorts,
  type InboundSender,
  type InboundTicket,
} from './process-inbound-message';

export const inboundEmailLimits = {
  /** Retry-only failures are parked after this many runs; mutation-phase attempts remain replayable. */
  maxAttempts: 3,
  /** Per-message claim; refreshed while processing and reclaimed after a worker crash. */
  processingLeaseMs: 5 * 60 * 1000,
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
type InboundEmailProcessingPhase =
  | 'CLAIMED'
  | 'RAW_STORED'
  | 'PARSED'
  | 'TICKET_MUTATION'
  | 'TICKET_WRITTEN'
  | 'ATTACHMENTS'
  | 'READY_TO_FINALIZE';
const mutationPhases = new Set<InboundEmailProcessingPhase>([
  'TICKET_MUTATION',
  'TICKET_WRITTEN',
  'ATTACHMENTS',
  'READY_TO_FINALIZE',
]);

function hasInboundMutationEvidence(row: {
  readonly processingPhase: InboundEmailProcessingPhase | null;
  readonly ticketId: string | null;
  readonly ticketMessageId: string | null;
  readonly createdTicketId: string | null;
}): boolean {
  return (row.processingPhase !== null && mutationPhases.has(row.processingPhase)) ||
    row.ticketId !== null ||
    row.ticketMessageId !== null ||
    row.createdTicketId !== null;
}

class LostInboundAttempt extends Error {
  constructor() {
    super('Inbound email processing lease was lost');
  }
}

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
      let cleared = 0;
      for (const row of rows) {
        if (row.rawStorageKey === null) continue;
        // Failure aborts the run before orphan pruning or metadata deletion.
        // ENOENT is safe: the file is already gone. Fence the update against
        // a concurrent replacement of the raw key or retention eligibility.
        await this.rawStore.remove(row.rawStorageKey);
        const updated = await this.prisma.inboundEmail.updateMany({
          where: { id: row.id, rawStorageKey: row.rawStorageKey, createdAt: { lt: rawCutoff } },
          data: { rawStorageKey: null },
        });
        cleared += updated.count;
      }
      rawRemoved += cleared;
      if (rows.length < inboundEmailLimits.retentionBatch || cleared === 0) break;
    }
    // Month folders a full month past the window (files of deleted rows, crashes).
    await this.rawStore.pruneMonthsBefore(new Date(rawCutoff.getTime() - 31 * 86_400_000));
    const rowCutoff = new Date(now.getTime() - configuration.metadataRetentionDays * 86_400_000);
    // Bounded metadata retention: at most one stable batch per run, never a
    // single unbounded deleteMany. The cutoff is rechecked inside the delete
    // so a row changed after selection is never removed, and a full batch
    // signals a possible backlog instead of silently looping all night.
    const candidates = await this.prisma.inboundEmail.findMany({
      where: { createdAt: { lt: rowCutoff }, rawStorageKey: null },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: inboundEmailLimits.retentionBatch,
    });
    let rowsRemoved = 0;
    if (candidates.length > 0) {
      const deleted = await this.prisma.inboundEmail.deleteMany({
        where: {
          id: { in: candidates.map((row) => row.id) },
          createdAt: { lt: rowCutoff },
          rawStorageKey: null,
        },
      });
      rowsRemoved = deleted.count;
      if (candidates.length === inboundEmailLimits.retentionBatch) {
        this.logger.warn('inbound_email_retention_batch_limit_reached possible_backlog=true');
      }
    }
    return { rawRemoved, rowsRemoved };
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
      where: {
        mailboxKey_providerMessageId: {
          mailboxKey,
          providerMessageId: normalizeInboundProviderMessageId(item.providerMessageId),
        },
      },
    });
    if (existing !== null && finalStatuses.has(existing.status)) {
      // A final DB outcome is durable; only the mailbox move may be missing.
      await session.move(item.providerMessageId, existing.status === 'PROCESSED' ? 'processed' : 'rejected');
      return 'SKIPPED';
    }
    if (
      existing !== null &&
      (existing.status === 'PROCESSING' || existing.status === 'FAILED') &&
      existing.processingPhase === null &&
      existing.processingLeaseExpiresAt === null
    ) {
      // Pre-W6.38 attempts have no idempotency proof. Do not guess whether a
      // legacy worker wrote to a ticket before it stopped; leave it in inbox.
      this.logger.warn(`inbound_email_legacy_attempt_requires_reconciliation id=${existing.id} status=${existing.status}`);
      return 'SKIPPED';
    }
    if (
      existing !== null &&
      existing.status === 'FAILED' &&
      existing.attempts >= inboundEmailLimits.maxAttempts &&
      !hasInboundMutationEvidence(existing)
    ) {
      this.logger.warn(`inbound_email_retry_limit_reached id=${existing.id} attempts=${existing.attempts}`);
      await session.move(item.providerMessageId, 'rejected');
      return 'SKIPPED';
    }
    const claim = await claimInboundEmailAttempt(this.prisma, {
      mailboxKey,
      providerMessageId: item.providerMessageId,
      existing: existing as InboundEmailAttemptSnapshot | null,
      now: new Date(),
      leaseMs: inboundEmailLimits.processingLeaseMs,
    });
    if (claim === null) return 'SKIPPED';
    const { row, ownerToken } = claim;
    let mutationStarted = existing !== null && hasInboundMutationEvidence(existing);
    const stopHeartbeat = this.startLeaseHeartbeat(row.id, ownerToken);

    try {
      if (item.raw.length === 0) {
        return await this.finish(session, item, row.id, ownerToken, { status: 'REJECTED', reason: 'TOO_LARGE' });
      }
      const rawStorageKey = configuration.rawRetentionDays > 0 ? await this.rawStore.save(row.id, item.raw, now).catch(() => null) : null;
      await this.updateAttemptProgress(row.id, ownerToken, 'RAW_STORED', { rawStorageKey }, mutationStarted);
      let message;
      try {
        message = await parseInboundMessage(item.raw);
      } catch {
        return await this.finish(session, item, row.id, ownerToken, { status: 'REJECTED', reason: 'PARSE_FAILED' });
      }
      await this.updateAttemptProgress(row.id, ownerToken, 'PARSED', {
        messageIdHeader: message.messageId?.slice(0, 500) ?? null,
        fromAddress: message.fromAddress?.slice(0, 320) ?? null,
        subject: message.subject.slice(0, 200),
        receivedAt: message.receivedAt,
      }, mutationStarted);
      const priorResult = await this.readPersistedResult(row.id, row);
      // R12: the same e-mail delivered twice (To + Cc, re-sent by a rule).
      if (priorResult === undefined && message.messageId !== null) {
        const duplicate = await this.prisma.inboundEmail.findFirst({
          where: { mailboxKey, messageIdHeader: message.messageId.slice(0, 500), status: 'PROCESSED', id: { not: row.id } },
          select: { id: true },
        });
        if (duplicate !== null) return await this.finish(session, item, row.id, ownerToken, { status: 'IGNORED', reason: 'DUPLICATE' });
      }
      const ownAddresses = [configuration.address, email.smtp?.fromAddress ?? '', email.presentation.replyToAddress ?? '']
        .map((address) => address.trim().toLowerCase())
        .filter((address) => address.length > 0);
      const beginMutation = async () => {
        await this.updateAttemptProgress(row.id, ownerToken, 'TICKET_MUTATION', {}, mutationStarted);
        mutationStarted = true;
      };
      const outcome = await processInboundMessage(message, this.ports(configuration, email, row.id, ownerToken, beginMutation), {
        ownAddresses,
        replyTokenSecret: readReplyTokenVerificationSecrets(),
        requireAuthPass: configuration.requireAuthPass,
        trustedAuthservId: configuration.trustedAuthservId,
        recipientPolicy: email,
        maxPerSenderPerHour: configuration.maxPerSenderPerHour,
        createTickets: configuration.createTickets,
        maxBodyLength: ticketConstants.maximumMessageBodyLength,
        now,
        inboundEmailId: row.id,
        ...(priorResult === undefined ? {} : { existingResult: priorResult }),
      });
      await this.updateAttemptProgress(row.id, ownerToken, 'READY_TO_FINALIZE');
      return await this.finish(session, item, row.id, ownerToken, outcome);
    } catch (error) {
      if (error instanceof LostInboundAttempt) return 'SKIPPED';
      const reason = errorText(error);
      this.logger.warn(`inbound_email_message_failed id=${row.id} reason=${reason}`);
      const markedFailed = await this.failAttempt(row.id, ownerToken, reason).catch(() => false);
      if (!markedFailed) return 'SKIPPED';
      // Technical failures stay in the inbox and remain retryable; a crash may
      // have happened after an idempotent ticket write committed.
      return 'FAILED';
    } finally {
      stopHeartbeat();
    }
  }

  private async readPersistedResult(
    inboundId: string,
    row: {
      readonly processingPhase: InboundEmailProcessingPhase | null;
      readonly ticketId: string | null;
      readonly ticketMessageId: string | null;
      readonly createdTicketId: string | null;
    },
  ): Promise<InboundPersistedResult | undefined> {
    if (row.createdTicketId !== null) {
      return { ticketId: row.createdTicketId, createdTicketId: row.createdTicketId, ticketMessageId: row.ticketMessageId };
    }
    if (row.ticketId !== null && row.ticketMessageId !== null) {
      return { ticketId: row.ticketId, ticketMessageId: row.ticketMessageId };
    }
    if (row.processingPhase === 'TICKET_WRITTEN' && row.ticketId !== null) return { ticketId: row.ticketId };

    const sourceTicket = await this.prisma.ticket.findUnique({
      where: { sourceInboundEmailId: inboundId },
      select: { id: true, reopenedFromTicketId: true },
    });
    if (sourceTicket !== null && sourceTicket.reopenedFromTicketId === null) {
      return { ticketId: sourceTicket.id, createdTicketId: sourceTicket.id };
    }
    const replyKey = inboundEmailIdempotencyKey(inboundId, 'reply');
    const reopenCommentKey = `${inboundEmailIdempotencyKey(inboundId, 'reopen')}:comment`;
    const persistedMessage = await this.prisma.ticketMessage.findFirst({
      where: { idempotencyKey: { in: [replyKey, reopenCommentKey] } },
      select: { id: true, ticketId: true, idempotencyKey: true },
    });
    if (persistedMessage === null) return undefined;
    const isReopenComment = persistedMessage.idempotencyKey === reopenCommentKey;
    if (isReopenComment) {
      await this.prisma.ticketMessage.update({ where: { id: persistedMessage.id }, data: { source: 'EMAIL' } });
    }
    const reopenedIntoNewTicket = sourceTicket !== null && isReopenComment;
    return {
      ticketId: reopenedIntoNewTicket ? sourceTicket.id : persistedMessage.ticketId,
      ticketMessageId: persistedMessage.id,
      ...(reopenedIntoNewTicket ? { createdTicketId: sourceTicket.id } : {}),
    };
  }

  private async updateAttemptProgress(
    id: string,
    ownerToken: string,
    phase: InboundEmailProcessingPhase,
    data: Prisma.InboundEmailUpdateManyMutationInput = {},
    preserveMutationPhase = false,
  ): Promise<void> {
    const now = new Date();
    const result = await this.prisma.inboundEmail.updateMany({
      where: {
        id,
        status: 'PROCESSING',
        processingOwnerToken: ownerToken,
        processingLeaseExpiresAt: { gt: now },
      },
      data: {
        ...data,
        ...(preserveMutationPhase ? {} : { processingPhase: phase }),
        processingLeaseExpiresAt: new Date(now.getTime() + inboundEmailLimits.processingLeaseMs),
      },
    });
    if (result.count !== 1) throw new LostInboundAttempt();
  }

  private async failAttempt(id: string, ownerToken: string, reason: string): Promise<boolean> {
    const result = await this.prisma.inboundEmail.updateMany({
      where: {
        id,
        status: 'PROCESSING',
        processingOwnerToken: ownerToken,
        processingLeaseExpiresAt: { gt: new Date() },
      },
      data: {
        status: 'FAILED',
        reason: reason.slice(0, 64),
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  private startLeaseHeartbeat(id: string, ownerToken: string): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interval = Math.max(1_000, Math.floor(inboundEmailLimits.processingLeaseMs / 3));
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(() => {
        const now = new Date();
        void this.prisma.inboundEmail.updateMany({
          where: {
            id,
            status: 'PROCESSING',
            processingOwnerToken: ownerToken,
            processingLeaseExpiresAt: { gt: now },
          },
          data: { processingLeaseExpiresAt: new Date(now.getTime() + inboundEmailLimits.processingLeaseMs) },
        }).then((result) => {
          if (result.count !== 1) {
            stopped = true;
            this.logger.warn(`inbound_email_processing_lease_lost id=${id}`);
            return;
          }
        }).catch(() => {
          this.logger.warn(`inbound_email_processing_lease_renew_failed id=${id}`);
        }).finally(schedule);
      }, interval);
      timer.unref?.();
    };
    schedule();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }

  private async finish(
    session: InboundMailboxSession,
    item: InboundMailboxItem,
    id: string,
    ownerToken: string,
    outcome: InboundOutcome,
  ): Promise<string> {
    const now = new Date();
    let updated: { count: number };
    try {
      updated = await this.prisma.inboundEmail.updateMany({
        where: {
          id,
          status: 'PROCESSING',
          processingOwnerToken: ownerToken,
          processingLeaseExpiresAt: { gt: now },
        },
        data: {
          status: outcome.status,
          reason: outcome.status === 'PROCESSED' ? (outcome.notes?.length ? 'ATTACHMENTS_REJECTED' : null) : outcome.reason,
          ticketId: 'ticketId' in outcome ? (outcome.ticketId ?? null) : null,
          ticketMessageId: outcome.status === 'PROCESSED' ? (outcome.ticketMessageId ?? null) : null,
          createdTicketId: outcome.status === 'PROCESSED' ? (outcome.createdTicketId ?? null) : null,
          processingPhase: null,
          processingOwnerToken: null,
          processingLeaseExpiresAt: null,
        },
      });
    } catch (error) {
      // BA-inbound-email-07: the partial unique index on
      // (mailboxKey, messageIdHeader) WHERE status='PROCESSED' makes the
      // losing concurrent delivery collide here. Convert it to the same
      // DUPLICATE outcome the pre-check would have produced.
      if (
        outcome.status === 'PROCESSED' &&
        typeof error === 'object' && error !== null && 'code' in error &&
        (error as { code: unknown }).code === 'P2002'
      ) {
        this.logger.warn(`inbound_email_duplicate_at_finish id=${id} resolution=ignored_duplicate`);
        return this.finish(session, item, id, ownerToken, { status: 'IGNORED', reason: 'DUPLICATE' });
      }
      throw error;
    }
    if (updated.count !== 1) throw new LostInboundAttempt();
    await session.move(item.providerMessageId, outcome.status === 'PROCESSED' ? 'processed' : 'rejected');
    return outcome.status;
  }

  private ports(
    configuration: InboundEmailConfiguration,
    email: EmailChannelConfiguration,
    inboundId: string,
    ownerToken: string,
    beginMutation: () => Promise<void>,
  ): InboundProcessingPorts {
    const context = (actorUserId: string): TicketMutationContext => ({
      actorUserId,
      messageSource: 'EMAIL',
      sourceInboundEmailId: inboundId,
    });
    const ticketSelect = { id: true, ticketNumber: true, status: true, mergedIntoTicketId: true } as const;
    const recordTicketWrite = (ticketId: string, ticketMessageId: string | null, createdTicketId?: string) =>
      this.updateAttemptProgress(inboundId, ownerToken, 'TICKET_WRITTEN', {
        ticketId,
        ticketMessageId,
        ...(createdTicketId === undefined ? {} : { createdTicketId }),
      });
    return {
      beginMutation,
      findSenderByEmail: async (address) => {
        // E-mail uniqueness is case-sensitive in PostgreSQL, so 'Ana@x' and
        // 'ana@x' can be different users. An unordered insensitive findFirst
        // would pick a nondeterministic actor; resolve deterministically and
        // refuse to guess when the address is ambiguous.
        const matches = await this.prisma.user.findMany({
          where: { email: { equals: address, mode: 'insensitive' } },
          select: { id: true, email: true, isActive: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 2,
        });
        if (matches.length > 1) {
          this.logger.warn(
            `inbound_email_sender_ambiguous matches=${matches.length} resolution=refused`,
          );
          return null;
        }
        return matches[0] ?? null;
      },
      findTicketById: async (ticketId) => this.prisma.ticket.findUnique({ where: { id: ticketId }, select: ticketSelect }),
      findTicketByNumber: async (ticketNumber) =>
        this.prisma.ticket.findUnique({ where: { ticketNumber }, select: ticketSelect }),
      countRecentFromSender: async (address, since) =>
        this.prisma.inboundEmail.count({
          where: { fromAddress: address, createdAt: { gte: since }, id: { not: inboundId }, status: { not: 'IGNORED' } },
        }),
      addReply: async (ticketId, senderId, body, idempotencyKey) =>
        asTicketError(async () => {
          const recoverPersistedReply = async () => {
            if (idempotencyKey === undefined) return null;
            const existing = await this.prisma.ticketMessage.findUnique({
              where: { ticketId_idempotencyKey: { ticketId, idempotencyKey } },
              select: { id: true },
            });
            if (existing === null) return null;
            await recordTicketWrite(ticketId, existing.id);
            return { messageId: existing.id };
          };
          const existing = await recoverPersistedReply();
          if (existing !== null) return existing;

          // R6: the requester writes a user reply, staff a public agent reply — never an internal note.
          try {
            const message = await this.collaboration.createMessage(
              ticketId,
              { type: 'USER_REPLY', body, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) },
              context(senderId),
            );
            await recordTicketWrite(ticketId, message.id);
            return { messageId: message.id };
          } catch (error) {
            const recovered = await recoverPersistedReply();
            if (recovered !== null) return recovered;
            if (ticketErrorCode(error) !== 'MESSAGE_TYPE_NOT_ALLOWED') throw error;
            try {
              const message = await this.collaboration.createMessage(
                ticketId,
                { type: 'AGENT_REPLY', body, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) },
                context(senderId),
              );
              await recordTicketWrite(ticketId, message.id);
              return { messageId: message.id };
            } catch (fallbackError) {
              const recoveredFallback = await recoverPersistedReply();
              if (recoveredFallback !== null) return recoveredFallback;
              throw fallbackError;
            }
          }
        }),
      reopenWithReply: async (ticketId, senderId, body, idempotencyKey) =>
        asTicketError(async () => {
          const commentKey = idempotencyKey === undefined ? undefined : `${idempotencyKey}:comment`;
          const recoverPersistedComment = async () => {
            if (commentKey === undefined) return null;
            const existing = await this.prisma.ticketMessage.findFirst({
              where: { idempotencyKey: commentKey },
              select: { id: true, ticketId: true },
            });
            if (existing === null) return null;
            await this.prisma.ticketMessage.update({ where: { id: existing.id }, data: { source: 'EMAIL' } });
            const sourceTicket = await this.prisma.ticket.findUnique({
              where: { sourceInboundEmailId: inboundId },
              select: { id: true },
            });
            if (sourceTicket !== null) {
              try {
                await this.tickets.resumeInboundCreatedTicket(sourceTicket.id, inboundId, senderId);
              } catch (error) {
                throw new Error('inbound_reopen_create_recovery_failed', { cause: error });
              }
            }
            const resultTicketId = sourceTicket?.id ?? existing.ticketId;
            await recordTicketWrite(resultTicketId, existing.id, sourceTicket?.id);
            return {
              messageId: existing.id,
              ticketId: resultTicketId,
              ...(sourceTicket === null ? {} : { createdTicketId: sourceTicket.id }),
            };
          };
          const existing = await recoverPersistedComment();
          if (existing !== null) return existing;

          const startedAt = new Date();
          try {
            await this.reopen.reopen(ticketId, { comment: body }, context(senderId), new Date(), idempotencyKey);
          } catch (error) {
            const recovered = await recoverPersistedComment();
            if (recovered !== null) return recovered;
            throw error;
          }
          const sourceTicket = await this.prisma.ticket.findUnique({
            where: { sourceInboundEmailId: inboundId },
            select: { id: true },
          });
          const resultTicketId = sourceTicket?.id ?? ticketId;
          const message = commentKey === undefined
            ? await this.prisma.ticketMessage.findFirst({
                where: { ticketId: resultTicketId, authorUserId: senderId, createdAt: { gte: startedAt }, type: { not: 'SYSTEM_EVENT' } },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
              })
            : await this.prisma.ticketMessage.findUnique({
                where: { ticketId_idempotencyKey: { ticketId: resultTicketId, idempotencyKey: commentKey } },
                select: { id: true },
              });
          if (message !== null) {
            await this.prisma.ticketMessage.update({ where: { id: message.id }, data: { source: 'EMAIL' } });
          }
          await recordTicketWrite(resultTicketId, message?.id ?? null, sourceTicket?.id);
          return {
            messageId: message?.id ?? null,
            ticketId: resultTicketId,
            ...(sourceTicket === null ? {} : { createdTicketId: sourceTicket.id }),
          };
        }),
      attach: async (ticketId, senderId, attachment, idempotencyKey) => {
        await this.updateAttemptProgress(inboundId, ownerToken, 'ATTACHMENTS');
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
            idempotencyKey,
          ),
        );
      },
      noteRejectedAttachment: async (ticketId, filename, reason, idempotencyKey) => {
        await this.updateAttemptProgress(inboundId, ownerToken, 'ATTACHMENTS');
        const data = {
          ticketId,
          type: 'SYSTEM_EVENT' as const,
          body: `inbound_attachment_rejected:${filename.replace(/[\r\n:]/g, ' ').slice(0, 200)}|${reason}`,
          authorUserId: null,
          source: 'EMAIL' as const,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        };
        if (idempotencyKey === undefined) {
          await this.prisma.ticketMessage.create({ data });
        } else {
          await this.prisma.ticketMessage.upsert({
            where: { ticketId_idempotencyKey: { ticketId, idempotencyKey } },
            create: data,
            update: {},
          });
        }
      },
      createTicket: async (senderId, title, description) => {
        try {
          const created = await asTicketError(() =>
            this.tickets.create(
              { title, description, impact: 'MEDIUM', urgency: 'MEDIUM', serviceId: configuration.defaultServiceId },
              context(senderId),
            ),
          );
          const ticketId = (created as { id: string }).id;
          await recordTicketWrite(ticketId, null, ticketId);
          return { ticketId };
        } catch (error) {
          if (error instanceof LostInboundAttempt) throw error;
          const persisted = await this.prisma.ticket.findUnique({
            where: { sourceInboundEmailId: inboundId },
            select: { id: true },
          });
          if (persisted === null) throw error;
          try {
            const recovered = await this.tickets.create(
              { title, description, impact: 'MEDIUM', urgency: 'MEDIUM', serviceId: configuration.defaultServiceId },
              context(senderId),
            );
            const ticketId = (recovered as { id: string }).id;
            await recordTicketWrite(ticketId, null, ticketId);
            return { ticketId };
          } catch (recoveryError) {
            throw new Error('inbound_ticket_create_recovery_failed', { cause: recoveryError });
          }
        }
      },
      resumeCreatedTicket: (ticketId, senderId) =>
        this.tickets.resumeInboundCreatedTicket(ticketId, inboundId, senderId),
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
