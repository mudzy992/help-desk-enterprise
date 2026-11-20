import { DbNull } from '@prisma/client/runtime/client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { serviceDowntimeWindowChangeLogEntityType } from '../../service-catalog/record-service-catalog-change';
import { retentionRedactionMarker } from './retention-markers';
import type { RetentionBatch, RetentionExecutor, RetentionPreview } from './retention-executors';

/** Changes per batch: the redaction touches five tables per change. */
const changeBatch = 50;

/**
 * BA-changes-17: retention for closed, rejected and cancelled changes.
 *
 * Until this executor existed a change stayed forever - the record, its plans,
 * the approval comments and the event JSON - and the API has no delete. The
 * policy follows the ticket and problem rules:
 *
 * - the **skeleton** stays: sequence/number, type, status, impact, likelihood,
 *   risk, the window and actual dates, unit, service/asset/problem links, the
 *   CAB group, requester and owner. Reports, the calendar and the audit trail
 *   keep their history;
 * - the **content** goes: title, description, reason, the four plans, the
 *   review notes and the cancellation reason become the retention marker;
 *   nullable text columns are emptied, the approval comments are emptied and
 *   the event details are dropped (action, actor and time stay);
 * - the **replicas** go with it: the calendar window the change wrote into
 *   service-catalog (`ServiceDowntimeWindow.message` carries `number · title`)
 *   is redacted, the `ChangeLog` entry of that window loses its reason and its
 *   `diff.after.message` (the same string once more, in the service history),
 *   and the in-app notifications that copied the change lose their body. Their `title` is a translation key and their payload holds ids only,
 *   so the deep link keeps working without keeping the text.
 *
 * Idempotency needs no column: a change counts as done once its title is the
 * marker, exactly like the problem executor. Legal holds are respected the same
 * way - the requester or the owner under hold (or anonymized) keeps the change
 * intact. **REJECTED** has no timestamp of its own (the CAB rejection is not a
 * lifecycle action with a timestamp), so its period counts from `updatedAt`;
 * a final change cannot be edited (`changeEditScope` returns `none`), which is
 * what makes that instant the rejection time.
 */
export function createChangeContentRetentionExecutor(prisma: PrismaClient): RetentionExecutor {
  const category = 'changeContent' as const;

  /** Closed, cancelled or rejected, past the period, not yet redacted, no hold. */
  function dueWhere(cutoff: Date) {
    return {
      OR: [
        { status: 'CLOSED' as const, closedAt: { lt: cutoff } },
        { status: 'CANCELLED' as const, cancelledAt: { lt: cutoff } },
        { status: 'REJECTED' as const, updatedAt: { lt: cutoff } },
      ],
      title: { not: retentionRedactionMarker },
      AND: [
        { OR: [{ requesterUserId: null }, { requester: { legalHoldAt: null } }] },
        { OR: [{ ownerUserId: null }, { owner: { legalHoldAt: null } }] },
      ],
    };
  }

  /** The instant the period counts from. */
  function closedAtOf(change: {
    status: string;
    closedAt: Date | null;
    cancelledAt: Date | null;
    updatedAt: Date;
  }): Date {
    if (change.status === 'CLOSED') return change.closedAt ?? change.updatedAt;
    if (change.status === 'CANCELLED') return change.cancelledAt ?? change.updatedAt;
    return change.updatedAt;
  }

  async function preview(cutoff: Date): Promise<RetentionPreview> {
    const where = dueWhere(cutoff);
    const [count, rows] = await Promise.all([
      prisma.changeRequest.count({ where }),
      prisma.changeRequest.findMany({
        where,
        select: { status: true, closedAt: true, cancelledAt: true, updatedAt: true },
        take: 5000,
      }),
    ]);
    const dates = rows.map((row) => closedAtOf(row));
    return {
      count,
      bytes: 0n,
      oldestAt: dates.length === 0 ? null : new Date(Math.min(...dates.map((date) => date.getTime()))),
      newestAt: dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime()))),
    };
  }

  async function executeBatch(cutoff: Date): Promise<RetentionBatch> {
    const changes = await prisma.changeRequest.findMany({
      where: dueWhere(cutoff),
      select: { id: true, sequence: true, status: true, closedAt: true, cancelledAt: true, updatedAt: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: changeBatch,
    });
    if (changes.length === 0) {
      return { items: 0, bytes: 0n, refs: [], oldestAt: null, newestAt: null, done: true, failures: 0 };
    }

    const ids = changes.map((change) => change.id);
    // Replicas are found by the pointer they stored, never by scanning content.
    const notifications = await prisma.notification.findMany({
      where: { OR: ids.map((id) => ({ payload: { path: ['changeId'], equals: id } })) },
      select: { id: true },
    });
    const windows = await prisma.serviceDowntimeWindow.findMany({
      where: { changeRequestId: { in: ids } },
      select: { id: true },
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.changeRequest.updateMany({
        where: { id: { in: ids }, title: { not: retentionRedactionMarker } },
        data: {
          title: retentionRedactionMarker,
          description: retentionRedactionMarker,
          reason: retentionRedactionMarker,
          implementationPlan: null,
          backoutPlan: null,
          testPlan: null,
          communicationPlan: null,
          reviewNotes: null,
          cancelReason: null,
        },
      });
      await transaction.changeApproval.updateMany({
        where: { changeId: { in: ids } },
        data: { comment: null },
      });
      await transaction.changeEvent.updateMany({
        where: { changeId: { in: ids } },
        data: { detail: DbNull },
      });
      await transaction.serviceDowntimeWindow.updateMany({
        where: { changeRequestId: { in: ids } },
        data: { message: retentionRedactionMarker },
      });
      if (windows.length > 0) {
        // The service history kept `number · title` in `diff.after.message`.
        await transaction.changeLog.updateMany({
          where: {
            entityType: serviceDowntimeWindowChangeLogEntityType(),
            entityId: { in: windows.map((window) => window.id) },
          },
          data: { reason: retentionRedactionMarker, diff: { redacted: retentionRedactionMarker } },
        });
      }
      if (notifications.length > 0) {
        await transaction.notification.updateMany({
          where: { id: { in: notifications.map((row) => row.id) } },
          data: { body: null },
        });
      }
    });

    const dates = changes.map((change) => closedAtOf(change));
    return {
      items: changes.length,
      bytes: 0n,
      // The number is derived from the sequence; the run row keeps it so an
      // operator can find the record without the content.
      refs: changes.map((change) => `#${change.sequence}`),
      oldestAt: new Date(Math.min(...dates.map((date) => date.getTime()))),
      newestAt: new Date(Math.max(...dates.map((date) => date.getTime()))),
      done: changes.length < changeBatch,
      failures: 0,
    };
  }

  return { category, preview, executeBatch };
}
