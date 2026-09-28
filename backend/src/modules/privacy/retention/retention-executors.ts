import type { PrismaService } from '../../../common/prisma/prisma.service';
// Runtime sentinel for SQL NULL in Json columns (the generated client re-exports the same value).
import { DbNull } from '@prisma/client/runtime/client';
import { auditLogActions, auditLogChainLockKey, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { appendAuditLog } from '../../audit-log/append-audit-log';
import type { TicketAttachmentStorage } from '../../tickets/attachments/attachments.types';
import { privacyLimits, type RetentionCategory } from '../privacy.constants';

/** Marker written over removed free text; the UI shows a translated label (contentRedactedAt / redactedAt). */
export const retentionRedactionMarker = '[redacted]';

export type RetentionPreview = {
  readonly count: number;
  readonly bytes: bigint;
  readonly oldestAt: Date | null;
  readonly newestAt: Date | null;
};

export type RetentionBatch = {
  readonly items: number;
  readonly bytes: bigint;
  readonly refs: readonly string[];
  readonly oldestAt: Date | null;
  readonly newestAt: Date | null;
  /** Nothing is left below the cutoff. */
  readonly done: boolean;
  /** Items skipped in this batch (e.g. a file could not be removed). */
  readonly failures: number;
};

export interface RetentionExecutor {
  readonly category: RetentionCategory;
  preview(cutoff: Date): Promise<RetentionPreview>;
  executeBatch(cutoff: Date): Promise<RetentionBatch>;
}

const ticketBatch = 100;
const auditBatch = 2000;

/**
 * Tickets whose retention period has passed: CLOSED or ARCHIVED (archiving
 * starts from CLOSED and keeps `closedAt`), no legal hold on the ticket or its requester.
 */
function dueTicketWhere(cutoff: Date) {
  return {
    status: { in: ['CLOSED' as const, 'ARCHIVED' as const] },
    closedAt: { lt: cutoff },
    legalHoldAt: null,
    requester: { legalHoldAt: null },
  };
}

function range(dates: readonly (Date | null | undefined)[]): { oldestAt: Date | null; newestAt: Date | null } {
  const values = dates.filter((date): date is Date => date instanceof Date).map((date) => date.getTime());
  if (values.length === 0) return { oldestAt: null, newestAt: null };
  return { oldestAt: new Date(Math.min(...values)), newestAt: new Date(Math.max(...values)) };
}

function emptyBatch(): RetentionBatch {
  return { items: 0, bytes: 0n, refs: [], oldestAt: null, newestAt: null, done: true, failures: 0 };
}

export function createRetentionExecutors(
  prisma: PrismaService,
  storage: TicketAttachmentStorage,
): Readonly<Record<RetentionCategory, RetentionExecutor>> {
  return {
    sessions: {
      category: 'sessions',
      async preview(cutoff) {
        const where = sessionWhere(cutoff);
        const [count, aggregate] = await Promise.all([
          prisma.userSession.count({ where }),
          prisma.userSession.aggregate({ where, _min: { createdAt: true }, _max: { createdAt: true } }),
        ]);
        return { count, bytes: 0n, oldestAt: aggregate._min.createdAt, newestAt: aggregate._max.createdAt };
      },
      async executeBatch(cutoff) {
        const rows = await prisma.userSession.findMany({
          where: sessionWhere(cutoff),
          select: { id: true, createdAt: true },
          take: privacyLimits.batchSize,
        });
        if (rows.length === 0) return emptyBatch();
        await prisma.userSession.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
        return {
          items: rows.length,
          bytes: 0n,
          refs: [],
          ...range(rows.map((row) => row.createdAt)),
          done: rows.length < privacyLimits.batchSize,
          failures: 0,
        };
      },
    },

    emailDeliveries: {
      category: 'emailDeliveries',
      async preview(cutoff) {
        const where = { createdAt: { lt: cutoff } };
        const [count, aggregate] = await Promise.all([
          prisma.notificationEmailDelivery.count({ where }),
          prisma.notificationEmailDelivery.aggregate({ where, _min: { createdAt: true }, _max: { createdAt: true } }),
        ]);
        return { count, bytes: 0n, oldestAt: aggregate._min.createdAt, newestAt: aggregate._max.createdAt };
      },
      async executeBatch(cutoff) {
        const rows = await prisma.notificationEmailDelivery.findMany({
          where: { createdAt: { lt: cutoff } },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: privacyLimits.batchSize,
        });
        if (rows.length === 0) return emptyBatch();
        await prisma.notificationEmailDelivery.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
        return {
          items: rows.length,
          bytes: 0n,
          refs: [],
          ...range(rows.map((row) => row.createdAt)),
          done: rows.length < privacyLimits.batchSize,
          failures: 0,
        };
      },
    },

    requestRegister: {
      category: 'requestRegister',
      async preview(cutoff) {
        const where = { closedAt: { lt: cutoff } };
        const [count, aggregate] = await Promise.all([
          prisma.dataSubjectRequest.count({ where }),
          prisma.dataSubjectRequest.aggregate({ where, _min: { closedAt: true }, _max: { closedAt: true } }),
        ]);
        return { count, bytes: 0n, oldestAt: aggregate._min.closedAt, newestAt: aggregate._max.closedAt };
      },
      async executeBatch(cutoff) {
        const rows = await prisma.dataSubjectRequest.findMany({
          where: { closedAt: { lt: cutoff } },
          select: { id: true, closedAt: true },
          orderBy: { closedAt: 'asc' },
          take: privacyLimits.batchSize,
        });
        if (rows.length === 0) return emptyBatch();
        await prisma.dataSubjectRequest.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
        return {
          items: rows.length,
          bytes: 0n,
          refs: rows.map((row) => row.id),
          ...range(rows.map((row) => row.closedAt)),
          done: rows.length < privacyLimits.batchSize,
          failures: 0,
        };
      },
    },

    attachments: {
      category: 'attachments',
      async preview(cutoff) {
        const ticketWhere = { ...dueTicketWhere(cutoff), attachmentsPurgedAt: null };
        const [count, bytes, aggregate] = await Promise.all([
          prisma.ticketAttachment.count({ where: { ticket: ticketWhere } }),
          prisma.ticketAttachment.aggregate({ where: { ticket: ticketWhere }, _sum: { sizeBytes: true } }),
          prisma.ticket.aggregate({
            where: { ...ticketWhere, attachments: { some: {} } },
            _min: { closedAt: true },
            _max: { closedAt: true },
          }),
        ]);
        return {
          count,
          bytes: BigInt(bytes._sum.sizeBytes ?? 0),
          oldestAt: aggregate._min.closedAt,
          newestAt: aggregate._max.closedAt,
        };
      },
      async executeBatch(cutoff) {
        const tickets = await prisma.ticket.findMany({
          where: { ...dueTicketWhere(cutoff), attachmentsPurgedAt: null, attachments: { some: {} } },
          select: {
            id: true,
            ticketNumber: true,
            closedAt: true,
            attachments: { select: { id: true, storagePath: true, sizeBytes: true } },
          },
          orderBy: [{ closedAt: 'asc' }, { id: 'asc' }],
          take: ticketBatch,
        });
        if (tickets.length === 0) return emptyBatch();
        let items = 0;
        let bytes = 0n;
        let failures = 0;
        const refs: string[] = [];
        const closed: Date[] = [];
        const now = new Date();
        for (const ticket of tickets) {
          const removed: string[] = [];
          for (const attachment of ticket.attachments) {
            try {
              await storage.remove(attachment.storagePath);
              removed.push(attachment.id);
              bytes += BigInt(attachment.sizeBytes);
            } catch {
              failures += 1;
            }
          }
          if (removed.length > 0) {
            await prisma.ticketAttachment.deleteMany({ where: { id: { in: removed } } });
            items += removed.length;
          }
          // A ticket whose files could not all be removed is retried next run.
          if (removed.length === ticket.attachments.length) {
            await prisma.ticket.update({ where: { id: ticket.id }, data: { attachmentsPurgedAt: now } });
            refs.push(ticket.ticketNumber);
            if (ticket.closedAt !== null) closed.push(ticket.closedAt);
          }
        }
        return {
          items,
          bytes,
          refs,
          ...range(closed),
          // Stop when a batch made no progress (every file failed) to avoid a hot loop.
          done: tickets.length < ticketBatch || items === 0,
          failures,
        };
      },
    },

    ticketContent: {
      category: 'ticketContent',
      async preview(cutoff) {
        const where = { ...dueTicketWhere(cutoff), contentRedactedAt: null };
        const [count, aggregate] = await Promise.all([
          prisma.ticket.count({ where }),
          prisma.ticket.aggregate({ where, _min: { closedAt: true }, _max: { closedAt: true } }),
        ]);
        return { count, bytes: 0n, oldestAt: aggregate._min.closedAt, newestAt: aggregate._max.closedAt };
      },
      async executeBatch(cutoff) {
        const tickets = await prisma.ticket.findMany({
          where: { ...dueTicketWhere(cutoff), contentRedactedAt: null },
          select: { id: true, ticketNumber: true, closedAt: true },
          orderBy: [{ closedAt: 'asc' }, { id: 'asc' }],
          take: ticketBatch,
        });
        if (tickets.length === 0) return emptyBatch();
        const ids = tickets.map((ticket) => ticket.id);
        const now = new Date();
        await prisma.$transaction(async (transaction) => {
          // The skeleton (dates, status, service, unit, SLA, CSAT rating) stays for reports.
          await transaction.ticket.updateMany({
            where: { id: { in: ids }, contentRedactedAt: null },
            data: {
              title: retentionRedactionMarker,
              description: retentionRedactionMarker,
              formData: DbNull,
              resolutionNote: null,
              lastForwardFromGroupName: null,
              contentRedactedAt: now,
            },
          });
          await transaction.ticketMessage.updateMany({
            where: { ticketId: { in: ids } },
            data: { body: retentionRedactionMarker, redactedAt: now },
          });
          await transaction.ticketMessageMention.deleteMany({ where: { message: { ticketId: { in: ids } } } });
          await transaction.ticketCsat.updateMany({ where: { ticketId: { in: ids } }, data: { comment: null } });
          await transaction.ticketApproval.updateMany({ where: { ticketId: { in: ids } }, data: { comment: null } });
          await transaction.ticketTimeLog.updateMany({
            where: { ticketId: { in: ids } },
            data: { note: null, correctionReason: null, deleteReason: null },
          });
          await transaction.ticketForwardEvent.updateMany({
            where: { ticketId: { in: ids } },
            data: { reason: retentionRedactionMarker },
          });
          await transaction.ticketActivity.updateMany({
            where: { ticketId: { in: ids } },
            data: { payload: DbNull },
          });
        });
        return {
          items: tickets.length,
          bytes: 0n,
          refs: tickets.map((ticket) => ticket.ticketNumber),
          ...range(tickets.map((ticket) => ticket.closedAt)),
          done: tickets.length < ticketBatch,
          failures: 0,
        };
      },
    },

    audit: {
      category: 'audit',
      async preview(cutoff) {
        const where = { createdAt: { lt: cutoff } };
        const [count, aggregate] = await Promise.all([
          prisma.auditLog.count({ where }),
          prisma.auditLog.aggregate({ where, _min: { createdAt: true }, _max: { createdAt: true } }),
        ]);
        return { count, bytes: 0n, oldestAt: aggregate._min.createdAt, newestAt: aggregate._max.createdAt };
      },
      /**
       * §6.5: rows older than the cutoff form a prefix of the chain (ordered by
       * createdAt, id). A batch deletes the oldest rows under the chain lock and
       * writes a checkpoint with the hash of the last deleted row, so the
       * remaining chain still verifies from there.
       */
      async executeBatch(cutoff) {
        return prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${auditLogChainLockKey})`;
            const rows = await transaction.auditLog.findMany({
              where: { createdAt: { lt: cutoff } },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: { id: true, hash: true, createdAt: true },
              take: auditBatch,
            });
            if (rows.length === 0) return emptyBatch();
            const last = rows[rows.length - 1];
            const previous = await transaction.auditChainCheckpoint.findFirst({
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select: { purgedCount: true },
            });
            await transaction.auditLog.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
            const purgedCount = (previous?.purgedCount ?? 0) + rows.length;
            const checkpoint = await transaction.auditChainCheckpoint.create({
              data: {
                throughId: last.id,
                throughCreatedAt: last.createdAt,
                throughHash: last.hash,
                purgedCount,
              },
              select: { id: true },
            });
            await appendAuditLog(transaction as never, {
              action: auditLogActions.auditRetentionPurged,
              entityType: auditLogEntityTypes.auditLog,
              entityId: checkpoint.id,
              metadata: {
                purged: rows.length,
                purgedTotal: purgedCount,
                throughId: last.id,
                throughCreatedAt: last.createdAt.toISOString(),
                throughHash: last.hash,
              },
              actorUserId: null,
            });
            return {
              items: rows.length,
              bytes: 0n,
              refs: [],
              ...range([rows[0].createdAt, last.createdAt]),
              done: rows.length < auditBatch,
              failures: 0,
            };
          },
          { timeout: 120_000 },
        );
      },
    },
  };
}

/** Ended sessions (revoked or expired) older than the cutoff; active sessions are never touched. */
function sessionWhere(cutoff: Date) {
  return {
    OR: [{ revokedAt: { lt: cutoff } }, { revokedAt: null, expiresAt: { lt: cutoff } }],
  };
}
