import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import { ProblemNotifier, type ProblemNoticeOutcome } from './problem-notifier';
import { problemVisibilityWhere } from './problem-visibility';
import { ProblemError, problemErrorCodes } from './problems.constants';
import {
  appendReminderStage,
  decideProblemReminderOutcome,
  dueReminderWhere,
  isProblemReminderStage,
  isReminderTerminal,
  readReminderStages,
  type ProblemReminderDecision,
  type ProblemTargetReminderStatusValue,
} from './sweep/problem-target-reminders';
import { problemReminderClaimStaleMilliseconds, problemSweepBatch } from './sweep/problem-sweep.constants';

/** The row the sweep and the API both act on. */
export type ProblemReminderRow = {
  readonly id: string;
  readonly problemId: string;
  readonly targetAt: Date;
  readonly stage: string;
  readonly attempts: number;
  readonly status: ProblemTargetReminderStatusValue;
};

export type ProblemReminderAttemptResult = {
  /** False when another sweep/operator claimed the row first (nothing was sent here). */
  readonly claimed: boolean;
  readonly status: ProblemTargetReminderStatusValue | null;
  readonly attempts: number;
  readonly deliveredCount: number;
  readonly recipientCount: number;
  readonly errorCode: string | null;
  readonly nextAttemptAt: Date | null;
};

export type ProblemReminderSweepCounts = {
  readonly attempted: number;
  readonly sent: number;
  readonly noRecipient: number;
  readonly failed: number;
  readonly dead: number;
  readonly cancelled: number;
};

export const emptyProblemReminderCounts: ProblemReminderSweepCounts = {
  attempted: 0,
  sent: 0,
  noRecipient: 0,
  failed: 0,
  dead: 0,
  cancelled: 0,
};

/** One attempt's contribution to the sweep counters. */
export function countReminderOutcome(
  counts: ProblemReminderSweepCounts,
  result: ProblemReminderAttemptResult,
): ProblemReminderSweepCounts {
  if (!result.claimed) return counts;
  const attempted = counts.attempted + 1;
  switch (result.status) {
    case 'SENT':
      return { ...counts, attempted, sent: counts.sent + 1 };
    case 'NO_RECIPIENT':
      return { ...counts, attempted, noRecipient: counts.noRecipient + 1 };
    case 'DEAD':
      return { ...counts, attempted, dead: counts.dead + 1 };
    case 'CANCELLED':
      return { ...counts, attempted, cancelled: counts.cancelled + 1 };
    default:
      return { ...counts, attempted, failed: counts.failed + 1 };
  }
}

export type ProblemTargetReminderView = {
  readonly id: string;
  readonly stage: string;
  readonly status: ProblemTargetReminderStatusValue;
  readonly targetAt: string;
  readonly attempts: number;
  readonly deliveredCount: number;
  readonly recipientCount: number;
  readonly errorCode: string | null;
  readonly nextAttemptAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly completedAt: string | null;
  /** True when this row may be retried right now (FAILED/DEAD/stale claim + problem.manage). */
  readonly canRetry: boolean;
};

export type ProblemTargetReminders = {
  readonly items: readonly ProblemTargetReminderView[];
  /** The viewer holds problem.manage for the problem's group. */
  readonly canRetry: boolean;
};

const reminderSelect = {
  id: true,
  problemId: true,
  targetAt: true,
  stage: true,
  status: true,
  attempts: true,
  deliveredCount: true,
  recipientCount: true,
  lastErrorCode: true,
  claimedAt: true,
  lastAttemptAt: true,
  nextAttemptAt: true,
  completedAt: true,
} as const;

type StoredReminder = Prisma.ProblemTargetReminderGetPayload<{ select: typeof reminderSelect }>;

/** The problem statuses the sweep reminds for (the same set it plans for). */
const reminderProblemStatuses = ['NEW', 'INVESTIGATING'] as const;

/** What a claim/finalise needs; both the full row and the narrow sweep select satisfy it. */
type ReminderIdentity = Pick<
  StoredReminder,
  'id' | 'problemId' | 'targetAt' | 'stage' | 'attempts' | 'status'
>;

function toRow(row: ReminderIdentity): ProblemReminderRow {
  return {
    id: row.id,
    problemId: row.problemId,
    targetAt: row.targetAt,
    stage: row.stage,
    attempts: row.attempts,
    status: row.status,
  };
}

/**
 * W7.25 (BA-problems-07): durable target reminders.
 *
 * The hourly sweep used to append the stage to `Problem.targetRemindersSent`
 * *before* resolving recipients, with the deliberate trade-off "a crash after
 * this skips one reminder instead of repeating it forever". Every one of those
 * paths (crash, owner deactivated/anonymised, all preferences OFF, in-app write
 * failure, e-mail failure, zero eligible recipients) lost the reminder while the
 * problem claimed it was sent.
 *
 * A reminder is now a row: created before the attempt, claimed by exactly one
 * worker, and finalised with the outcome of the attempt. Only `SENT` (at least
 * one recipient got a channel) and `NO_RECIPIENT` (policy left nobody to notify)
 * append the legacy marker; `FAILED` is retried by the hourly sweep after
 * 2/10/60/240 minutes, the fifth failure leaves it `DEAD`, and an operator can
 * retry a FAILED/DEAD row from the problem detail.
 *
 * Repeat sends are safe: the in-app row carries the unique dedupe key
 * `problem:problem.target_due:<problemId>:<stage>:<targetAt>` and the e-mail goes
 * through `NotificationEmailDelivery`, which claims `[userId, dedupeKey]` too.
 * The marker is written *after* the terminal row, so a crash in between cannot
 * produce a false "sent" (and the next sweep repairs the marker from the row).
 */
@Injectable()
export class ProblemTargetReminderService {
  private readonly logger = new Logger(ProblemTargetReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly notifier: ProblemNotifier,
  ) {}

  /**
   * The row for (problem, target, stage), created on first touch. A unique
   * violation means a concurrent sweep created it first: the row is re-read.
   */
  async ensure(problemId: string, targetAt: Date, stage: string): Promise<StoredReminder> {
    const where = { problemId_targetAt_stage: { problemId, targetAt, stage } };
    const existing = await this.prisma.problemTargetReminder.findUnique({ where, select: reminderSelect });
    if (existing !== null) return existing;
    try {
      const created = await this.prisma.problemTargetReminder.create({
        data: { problemId, targetAt, stage },
        select: reminderSelect,
      });
      return created;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const raced = await this.prisma.problemTargetReminder.findUnique({ where, select: reminderSelect });
      if (raced === null) throw error;
      return raced;
    }
  }

  /**
   * Claims one row, checks that the reminder still belongs to the problem, asks
   * the notifier for an outcome and records it. Returns `claimed: false` when
   * another worker won the race, so callers never count a send twice.
   */
  async attempt(
    row: ProblemReminderRow,
    options: { readonly now?: Date; readonly manual?: boolean } = {},
  ): Promise<ProblemReminderAttemptResult> {
    const now = options.now ?? new Date();
    const manual = options.manual === true;
    const claimed = await this.claim(row.id, now, manual);
    if (!claimed) return { claimed: false, status: null, attempts: row.attempts, deliveredCount: 0, recipientCount: 0, errorCode: null, nextAttemptAt: null };
    const current = await this.prisma.problemTargetReminder.findUnique({
      where: { id: row.id },
      select: reminderSelect,
    });
    if (current === null) {
      return { claimed: false, status: null, attempts: row.attempts, deliveredCount: 0, recipientCount: 0, errorCode: null, nextAttemptAt: null };
    }

    const ineligible = await this.ineligibleReason(current);
    if (ineligible !== null) {
      await this.finalize(current, { status: 'CANCELLED', appendsMarker: false, nextAttemptAt: null, errorCode: ineligible }, null, now);
      return {
        claimed: true,
        status: 'CANCELLED',
        attempts: current.attempts,
        deliveredCount: 0,
        recipientCount: 0,
        errorCode: ineligible,
        nextAttemptAt: null,
      };
    }

    let outcome: ProblemNoticeOutcome;
    try {
      outcome = await this.notifier.targetDueDetailed(current.problemId, current.stage);
    } catch (error) {
      this.logger.warn(
        `problem_target_reminder_failed problem=${current.problemId} stage=${current.stage} reason=${error instanceof Error ? error.message : String(error)}`,
      );
      outcome = { delivered: 0, recipients: 0, failures: 1, errorCode: 'NOTIFIER_FAILED' };
    }
    const decision = decideProblemReminderOutcome({ outcome, attempts: current.attempts, now });
    await this.finalize(current, decision, outcome, now);
    return {
      claimed: true,
      status: decision.status,
      attempts: current.attempts,
      deliveredCount: outcome.delivered,
      recipientCount: outcome.recipients,
      errorCode: decision.errorCode,
      nextAttemptAt: decision.nextAttemptAt,
    };
  }

  /**
   * The hourly retry pass: PENDING rows (created but never attempted because the
   * worker died), FAILED rows whose backoff elapsed and stale CLAIMED rows.
   */
  async retryDue(now: Date, limit: number = problemSweepBatch): Promise<ProblemReminderSweepCounts> {
    const due = await this.prisma.problemTargetReminder.findMany({
      where: dueReminderWhere(now),
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true, problemId: true, targetAt: true, stage: true, attempts: true, status: true },
    });
    let counts = emptyProblemReminderCounts;
    for (const row of due) {
      const result = await this.attempt(toRow(row), { now });
      counts = countReminderOutcome(counts, result);
    }
    return counts;
  }

  /** Repairs the legacy marker of rows that already reached a terminal outcome. */
  async repairMarker(row: { problemId: string; targetAt: Date; stage: string; status: string }): Promise<void> {
    if (row.status !== 'SENT' && row.status !== 'NO_RECIPIENT') return;
    await this.appendMarker(row.problemId, row.targetAt, row.stage);
  }

  /** `GET /problems/:id/target-reminders` — `problem.read` scope decides visibility. */
  async list(problemId: string, viewer: ProblemViewer): Promise<ProblemTargetReminders> {
    const scope = await this.access.require(viewer, permissionKeys.problemRead);
    const filter = problemVisibilityWhere(scope, viewer.userId);
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, ...(filter === null ? {} : { AND: [filter] }) },
      select: { id: true, groupId: true },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    const canManage = await this.canManage(viewer, problem.groupId);
    const rows = await this.prisma.problemTargetReminder.findMany({
      where: { problemId },
      orderBy: [{ targetAt: 'desc' }, { createdAt: 'asc' }],
      take: 50,
      select: reminderSelect,
    });
    return { items: rows.map((row) => this.view(row, canManage)), canRetry: canManage };
  }

  /**
   * `POST /problems/:id/target-reminders/:reminderId/retry` — one operator-
   * triggered attempt. A manual retry gets a fresh attempt budget (the row may be
   * DEAD precisely because the budget was spent); SENT/NO_RECIPIENT/CANCELLED
   * rows are final, and a live claim is left to the worker that holds it.
   */
  async retry(problemId: string, reminderId: string, viewer: ProblemViewer): Promise<ProblemTargetReminders> {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const readScope = await this.access.require(viewer, permissionKeys.problemRead);
    const filters = [problemVisibilityWhere(scope, viewer.userId), problemVisibilityWhere(readScope, viewer.userId)].filter(
      (filter) => filter !== null,
    );
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, ...(filters.length === 0 ? {} : { AND: filters }) },
      select: { id: true, groupId: true },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    if (!(await this.canManage(viewer, problem.groupId))) {
      throw new ProblemError(problemErrorCodes.forbidden, 'problem.manage');
    }
    const row = await this.prisma.problemTargetReminder.findFirst({
      where: { id: reminderId, problemId },
      select: reminderSelect,
    });
    if (row === null) throw new ProblemError(problemErrorCodes.targetReminderNotFound);
    if (row.status === 'SENT' || row.status === 'NO_RECIPIENT' || row.status === 'CANCELLED') {
      throw new ProblemError(problemErrorCodes.targetReminderFinal);
    }
    const result = await this.attempt(toRow(row), { manual: true });
    if (!result.claimed) throw new ProblemError(problemErrorCodes.targetReminderInProgress);
    return this.list(problemId, viewer);
  }

  /** Claim: only a due row (or, manually, a not-final one) is taken; the claim fences finalisation. */
  private async claim(reminderId: string, now: Date, manual: boolean): Promise<boolean> {
    const claimed = await this.prisma.problemTargetReminder.updateMany({
      where: manual
        ? { id: reminderId, status: { in: ['PENDING', 'FAILED', 'DEAD'] } }
        : { id: reminderId, ...dueReminderWhere(now) },
      data: {
        status: 'CLAIMED',
        claimedAt: now,
        lastAttemptAt: now,
        nextAttemptAt: null,
        // A manual retry restarts the budget, so a DEAD row is not dead after one more try.
        attempts: manual ? { set: 1 } : { increment: 1 },
      },
    });
    return claimed.count > 0;
  }

  /**
   * Why the reminder no longer belongs to the problem, or null when it does.
   * The target identity is part of the check: a re-armed target (priority change,
   * reopen) writes a new `targetAt`, and this row must never mark the new one.
   */
  private async ineligibleReason(row: StoredReminder): Promise<string | null> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: row.problemId },
      select: { status: true, targetAt: true },
    });
    if (problem === null) return 'PROBLEM_MISSING';
    if (problem.targetAt === null || problem.targetAt.getTime() !== row.targetAt.getTime()) return 'TARGET_MOVED';
    if (!(reminderProblemStatuses as readonly string[]).includes(problem.status)) return 'PROBLEM_NOT_OPEN';
    return null;
  }

  /**
   * Writes the outcome of the attempt. Only the claim holder finalises, and the
   * marker follows the row so the two cannot disagree in the "sent" direction.
   */
  private async finalize(
    row: StoredReminder,
    decision: ProblemReminderDecision,
    outcome: ProblemNoticeOutcome | null,
    now: Date,
  ): Promise<void> {
    const terminal = isReminderTerminal(decision.status);
    const updated = await this.prisma.problemTargetReminder.updateMany({
      where: { id: row.id, status: 'CLAIMED' },
      data: {
        status: decision.status,
        deliveredCount: outcome?.delivered ?? 0,
        recipientCount: outcome?.recipients ?? 0,
        lastErrorCode: decision.errorCode,
        nextAttemptAt: decision.nextAttemptAt,
        claimedAt: null,
        completedAt: terminal ? now : null,
      },
    });
    if (updated.count === 0) return;
    if (decision.appendsMarker && isProblemReminderStage(row.stage)) {
      await this.appendMarker(row.problemId, row.targetAt, row.stage);
    }
  }

  /**
   * The legacy `Problem.targetRemindersSent` stays the idempotency key of the
   * planner and the "reminded" badge in the UI; it is appended (never rewritten)
   * and only for the target the row belongs to.
   */
  private async appendMarker(problemId: string, targetAt: Date, stage: string): Promise<void> {
    if (!isProblemReminderStage(stage)) return;
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
      select: { targetAt: true, targetRemindersSent: true },
    });
    if (problem === null || problem.targetAt === null || problem.targetAt.getTime() !== targetAt.getTime()) return;
    const before = readReminderStages(problem.targetRemindersSent);
    const after = appendReminderStage(problem.targetRemindersSent, stage);
    if (after.length === before.length) return;
    await this.prisma.problem.updateMany({
      where: { id: problemId, targetAt },
      data: { targetRemindersSent: after },
    });
  }

  private async canManage(viewer: ProblemViewer, groupId: string | null): Promise<boolean> {
    if (!this.access.hasPermission(viewer, permissionKeys.problemManage)) return false;
    return this.access.hasGroupAuthority(viewer, permissionKeys.problemManage, groupId);
  }

  private view(row: StoredReminder, canManage: boolean): ProblemTargetReminderView {
    return {
      id: row.id,
      stage: row.stage,
      status: row.status,
      targetAt: row.targetAt.toISOString(),
      attempts: row.attempts,
      deliveredCount: row.deliveredCount,
      recipientCount: row.recipientCount,
      errorCode: row.lastErrorCode,
      nextAttemptAt: row.nextAttemptAt === null ? null : row.nextAttemptAt.toISOString(),
      lastAttemptAt: row.lastAttemptAt === null ? null : row.lastAttemptAt.toISOString(),
      completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
      canRetry: canManage && this.retryableNow(row),
    };
  }

  /** FAILED/DEAD (or a PENDING row) can be retried; a live claim belongs to its worker. */
  private retryableNow(row: StoredReminder): boolean {
    if (row.status === 'PENDING' || row.status === 'FAILED' || row.status === 'DEAD') return true;
    if (row.status !== 'CLAIMED' || row.claimedAt === null) return false;
    return Date.now() - row.claimedAt.getTime() > problemReminderClaimStaleMilliseconds;
  }
}
