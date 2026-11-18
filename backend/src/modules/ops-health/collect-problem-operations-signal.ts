import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  autoCloseDueWhere,
  breachedProblemTargetWhere,
  stuckProblemReminderWhere,
  type ProblemOperationsSignal,
} from '../problems/sweep/problem-operations';
import { problemNoticeTopic } from '../problems/problem-notice-outbox';

export type ProblemOperationsPrisma = Pick<PrismaService, 'problemTargetReminder' | 'problem' | 'outboxMessage'>;

export type ProblemOperationsOptions = {
  /**
   * W7.40 (BA-problems-18): the effective (already clamped) `autoCloseDays` of
   * the problem module. `null` means the setting could not be read, which is a
   * different fact from "0 = auto-close is off" and is reported as such.
   */
  readonly autoCloseDays: number | null;
};

/**
 * W7.32 (BA-problems-14): read-only, privacy-safe state of the problem sweep's
 * *outcomes*. The queue health says whether the hourly job runs; this says what
 * it left behind — reminders that never left and targets nobody can still reach.
 * Both are counts and one age, never a problem id or a recipient.
 *
 * W7.40 (BA-problems-18) adds the two backlog ages that turn "how many" into
 * "how far behind": the oldest breached target and the oldest problem whose
 * auto-close deadline passed. A sweep that cannot finish its batch no longer
 * hides behind a large count that looks the same every hour.
 */
export async function collectProblemOperationsSignal(
  prisma: ProblemOperationsPrisma,
  now: Date,
  options: ProblemOperationsOptions,
): Promise<ProblemOperationsSignal> {
  const stuckWhere = stuckProblemReminderWhere(now);
  const breachedWhere = breachedProblemTargetWhere(now);
  const autoCloseDays = options.autoCloseDays;
  const autoCloseWhere = autoCloseDays === null ? null : autoCloseDueWhere(now, autoCloseDays);
  const noticeWhere = { topic: problemNoticeTopic };
  const [stuck, dead, oldestStuck, breached, oldestBreached, autoCloseDue, oldestDue, noticesPending, noticesProcessing, noticesDead, oldestNotice] = await Promise.all([
    prisma.problemTargetReminder.count({ where: stuckWhere }),
    prisma.problemTargetReminder.count({ where: { status: 'DEAD' } }),
    prisma.problemTargetReminder.findFirst({
      where: stuckWhere,
      orderBy: { updatedAt: 'asc' },
      select: { updatedAt: true },
    }),
    prisma.problem.count({ where: breachedWhere }),
    prisma.problem.findFirst({
      where: breachedWhere,
      orderBy: { targetAt: 'asc' },
      select: { targetAt: true },
    }),
    autoCloseWhere === null ? Promise.resolve(null) : prisma.problem.count({ where: autoCloseWhere }),
    autoCloseWhere === null
      ? Promise.resolve(null)
      : prisma.problem.findFirst({
          where: autoCloseWhere,
          orderBy: { resolvedAt: 'asc' },
          select: { resolvedAt: true },
        }),
    // W7.42: the notice outbox of the problem module, same numbers the
    // processor logs when it drains.
    prisma.outboxMessage.count({ where: { ...noticeWhere, status: 'PENDING' } }),
    prisma.outboxMessage.count({ where: { ...noticeWhere, status: 'PROCESSING' } }),
    prisma.outboxMessage.count({ where: { ...noticeWhere, status: 'DEAD_LETTER' } }),
    prisma.outboxMessage.findFirst({
      where: { ...noticeWhere, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);
  const autoCloseDeadlineMs =
    autoCloseDays === null ? null : autoCloseDays * 86_400_000;
  return {
    stuckReminderDeliveries: stuck,
    deadReminderDeliveries: dead,
    oldestStuckReminderMinutes:
      oldestStuck?.updatedAt == null
        ? null
        : Math.max(0, Math.floor((now.getTime() - oldestStuck.updatedAt.getTime()) / 60_000)),
    breachedOpenTargets: breached,
    oldestOverdueTargetMinutes:
      oldestBreached?.targetAt == null
        ? null
        : Math.max(0, Math.floor((now.getTime() - oldestBreached.targetAt.getTime()) / 60_000)),
    autoCloseDue,
    oldestAutoCloseDueMinutes:
      autoCloseDeadlineMs === null || oldestDue?.resolvedAt == null
        ? null
        : Math.max(0, Math.floor((now.getTime() - (oldestDue.resolvedAt.getTime() + autoCloseDeadlineMs)) / 60_000)),
    effectiveAutoCloseDays: autoCloseDays,
    noticeOutbox: {
      pending: noticesPending,
      processing: noticesProcessing,
      deadLetter: noticesDead,
      oldestPendingMinutes:
        oldestNotice?.createdAt == null
          ? null
          : Math.max(0, Math.floor((now.getTime() - oldestNotice.createdAt.getTime()) / 60_000)),
    },
  };
}
