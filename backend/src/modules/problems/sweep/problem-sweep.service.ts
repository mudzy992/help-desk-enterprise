import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { localHour } from '../../assets/reminders/plan-asset-reminders';
import { ProblemAccessService } from '../problem-access.service';
import {
  ProblemTargetReminderService,
  countReminderOutcome,
  emptyProblemReminderCounts,
  type ProblemReminderSweepCounts,
} from '../problem-target-reminder.service';
import { loadProblemTargetCalendar } from '../problem-target';
import { problemEventActions } from '../problems.constants';
import { planProblemReminder } from './plan-problem-reminders';
import { isReminderTerminal, readReminderStages } from './problem-target-reminders';
import { problemSweepBatch, problemSweepReminderStartHour, problemSweepTickBudgetMilliseconds } from './problem-sweep.constants';

export type ProblemSweepResult = {
  readonly skipped: string | null;
  readonly closed: number;
  readonly reminders: number;
  /** W7.25: per-outcome detail, so a lost reminder is not reported as "sent". */
  readonly reminderOutcomes: ProblemReminderSweepCounts;
  /**
   * W7.40 (BA-problems-18): rows this tick loaded and did not process, because
   * its time budget ran out. The next tick starts with them (oldest-first), so a
   * deferred row is late, never lost.
   */
  readonly deferred: ProblemSweepDeferred;
  /** W7.40: the tick stopped on its budget instead of running out of work. */
  readonly budgetReached: boolean;
};

/** W7.40: per phase, so a stuck phase is visible instead of averaged away. */
export type ProblemSweepDeferred = { readonly autoClose: number; readonly reminders: number };

/**
 * W7.40: the boundary of one tick. `deadlineMs` is set by `run` from
 * `problemSweepTickBudgetMilliseconds`; tests pass it directly instead of
 * waiting, and a caller without a deadline keeps the batch bound only.
 */
export type ProblemSweepOptions = {
  readonly ignoreHour?: boolean;
  readonly deadlineMs?: number;
};

/** One tick's proof of work: what it did, what it left, and why it stopped. */
type SweepPhaseOutcome = {
  readonly processed: number;
  readonly deferred: number;
  /** The phase had at least one more row than its batch; the next tick takes it. */
  readonly capped: boolean;
  readonly budgetReached: boolean;
};

type AutoCloseOutcome = SweepPhaseOutcome & { readonly closed: number };
type ReminderPhaseOutcome = SweepPhaseOutcome & { readonly counts: ProblemReminderSweepCounts };

const dayMs = 86_400_000;
const emptyPhaseOutcome: SweepPhaseOutcome = { processed: 0, deferred: 0, capped: false, budgetReached: false };
const emptyDeferred: ProblemSweepDeferred = { autoClose: 0, reminders: 0 };
const emptyAutoCloseOutcome: AutoCloseOutcome = { ...emptyPhaseOutcome, closed: 0 };
const emptyReminderPhaseOutcome: ReminderPhaseOutcome = { ...emptyPhaseOutcome, counts: emptyProblemReminderCounts };

/**
 * Paket 3.3 (P5): auto-close of resolved problems after `autoCloseDays`
 * (0 = never) and the target reminders. The module switch is checked first;
 * with the module off nothing changes.
 */
@Injectable()
export class ProblemSweepService {
  private readonly logger = new Logger(ProblemSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly reminders: ProblemTargetReminderService,
  ) {}

  async run(now: Date = new Date(), options: ProblemSweepOptions = {}): Promise<ProblemSweepResult> {
    if (!(await this.access.isEnabled())) {
      return {
        skipped: 'module_disabled',
        closed: 0,
        reminders: 0,
        reminderOutcomes: emptyProblemReminderCounts,
        deferred: emptyDeferred,
        budgetReached: false,
      };
    }
    const configuration = await this.access.configuration();
    // The budget is wall-clock: `now` is the sweep's business time, not the tick's.
    const deadlineMs = options.deadlineMs ?? Date.now() + problemSweepTickBudgetMilliseconds;
    const closedPass = configuration.autoCloseDays > 0
      ? await this.autoClosePass(now, configuration.autoCloseDays, { deadlineMs })
      : emptyAutoCloseOutcome;
    const reminderPass = configuration.targetEnabled
      ? await this.remindPass(now, configuration.targetCalendarId, options.ignoreHour === true, { deadlineMs })
      : emptyReminderPhaseOutcome;
    const closed = closedPass.closed;
    const reminderOutcomes = reminderPass.counts;
    const deferred: ProblemSweepDeferred = {
      autoClose: closedPass.deferred,
      reminders: reminderPass.deferred,
    };
    const budgetReached = closedPass.budgetReached || reminderPass.budgetReached;
    if (closed > 0 || reminderOutcomes.attempted > 0 || budgetReached) {
      this.logger.log(
        `problem_sweep closed=${closed} reminders_sent=${reminderOutcomes.sent} reminders_no_recipient=${reminderOutcomes.noRecipient} reminders_failed=${reminderOutcomes.failed} reminders_dead=${reminderOutcomes.dead} reminders_cancelled=${reminderOutcomes.cancelled} auto_close_days=${configuration.autoCloseDays} deferred_auto_close=${deferred.autoClose} deferred_reminders=${deferred.reminders} budget_reached=${budgetReached}`,
      );
    }
    return { skipped: null, closed, reminders: reminderOutcomes.sent, reminderOutcomes, deferred, budgetReached };
  }

  /** §5: RESOLVED -> CLOSED after N days without a reopen; recorded like a manual close, without an actor. */
  async autoClose(now: Date, days: number): Promise<number> {
    return (await this.autoClosePass(now, days)).closed;
  }

  /**
   * W7.40 (BA-problems-18): the auto-close phase of one tick, with its own
   * proof of work.
   *
   * - The rows come **oldest-due first** (`resolvedAt: 'asc'`), so a batch cap
   *   defers the newest problems and the oldest never starve.
   * - `batch + 1` rows are asked for, so "there is more" is a fact and not a
   *   guess: reaching the batch logs `problem_sweep_batch_cap_reached`.
   * - Before each row the deadline is checked. A tick that runs out of time
   *   stops between rows — never inside one transaction — and reports the rows
   *   it loaded but did not process.
   */
  async autoClosePass(now: Date, days: number, options: { readonly deadlineMs?: number } = {}): Promise<AutoCloseOutcome> {
    const before = new Date(now.getTime() - days * dayMs);
    const rows = await this.prisma.problem.findMany({
      where: { status: 'RESOLVED', resolvedAt: { lte: before } },
      select: { id: true, version: true, organizationalUnitId: true },
      orderBy: { resolvedAt: 'asc' },
      take: problemSweepBatch + 1,
    });
    const capped = rows.length > problemSweepBatch;
    const due = capped ? rows.slice(0, problemSweepBatch) : rows;
    let closed = 0;
    let processed = 0;
    let budgetReached = false;
    for (const problem of due) {
      if (options.deadlineMs !== undefined && Date.now() >= options.deadlineMs) {
        budgetReached = true;
        break;
      }
      processed += 1;
      const done = await this.prisma.$transaction(async (transaction) => {
        const result = await transaction.problem.updateMany({
          where: { id: problem.id, status: 'RESOLVED', version: problem.version },
          data: { status: 'CLOSED', closedAt: now, version: { increment: 1 } },
        });
        if (result.count === 0) return false;
        const detail = { from: 'RESOLVED', to: 'CLOSED', reason: null, auto: true, days };
        await transaction.problemEvent.create({ data: { problemId: problem.id, action: problemEventActions.status, actorUserId: null, detail } });
        await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
          action: auditLogActions.problemClosed,
          entityType: auditLogEntityTypes.problem,
          entityId: problem.id,
          organizationalUnitId: problem.organizationalUnitId,
          metadata: detail as never,
          actorUserId: null,
        });
        return true;
      });
      if (done) closed += 1;
    }
    if (capped) {
      this.logger.warn(
        `problem_sweep_batch_cap_reached phase=auto_close batch=${problemSweepBatch} oldest_due=${before.toISOString()}`,
      );
    }
    const deferred = due.length - processed;
    if (budgetReached) {
      this.logger.warn(
        `problem_sweep_budget_reached phase=auto_close budget_ms=${problemSweepTickBudgetMilliseconds} processed=${processed} deferred=${deferred}`,
      );
    }
    return { closed, processed, deferred, capped, budgetReached };
  }

  /** §10: reminders from 07:00 local on working days; each stage once per target. */
  async remind(now: Date, calendarId: string, ignoreHour: boolean): Promise<number> {
    return (await this.remindDetailed(now, calendarId, ignoreHour)).sent;
  }

  /**
   * W7.25 (BA-problems-07): two passes per tick.
   *
   * 1. Retry what earlier ticks could not deliver: PENDING rows (the worker died
   *    before the attempt), FAILED rows whose 2/10/60/240-minute backoff elapsed,
   *    stale CLAIMED rows, and the e-mail ledger's pending retries.
   * 2. Plan the reminder of today's stage and, when the row is not final yet,
   *    attempt it. A row that already reached SENT/NO_RECIPIENT only has its
   *    legacy marker repaired, never sent again.
   */
  async remindDetailed(now: Date, calendarId: string, ignoreHour: boolean): Promise<ProblemReminderSweepCounts> {
    return (await this.remindPass(now, calendarId, ignoreHour)).counts;
  }

  /**
   * W7.40 (BA-problems-18): the reminder phase of one tick, with the same
   * oldest-first ordering, `batch + 1` proof and per-row deadline as auto-close.
   * The retry pass keeps its own batch bound inside the reminder service.
   */
  async remindPass(
    now: Date,
    calendarId: string,
    ignoreHour: boolean,
    options: { readonly deadlineMs?: number } = {},
  ): Promise<ReminderPhaseOutcome> {
    const calendar = await loadProblemTargetCalendar(this.prisma, calendarId);
    if (calendar === null) return emptyReminderPhaseOutcome;
    if (!ignoreHour && localHour(now, calendar.timezone) < problemSweepReminderStartHour) {
      return emptyReminderPhaseOutcome;
    }
    let counts = await this.reminders.retryDue(now, problemSweepBatch);
    const horizon = new Date(now.getTime() + 10 * dayMs);
    const rows = await this.prisma.problem.findMany({
      where: { status: { in: ['NEW', 'INVESTIGATING'] }, targetAt: { not: null, lte: horizon } },
      select: { id: true, targetAt: true, targetRemindersSent: true },
      orderBy: { targetAt: 'asc' },
      take: problemSweepBatch + 1,
    });
    const capped = rows.length > problemSweepBatch;
    const problems = capped ? rows.slice(0, problemSweepBatch) : rows;
    let processed = 0;
    let budgetReached = false;
    for (const problem of problems) {
      if (options.deadlineMs !== undefined && Date.now() >= options.deadlineMs) {
        budgetReached = true;
        break;
      }
      processed += 1;
      const targetAt = problem.targetAt as Date;
      const remindersSent = readReminderStages(problem.targetRemindersSent);
      const stage = planProblemReminder(calendar, { targetAt, remindersSent }, now);
      if (stage === null) continue;
      // The row is written before the attempt and is the source of truth for
      // "this reminder was handled"; the marker only mirrors a confirmed outcome.
      const row = await this.reminders.ensure(problem.id, targetAt, stage);
      if (isReminderTerminal(row.status)) {
        await this.reminders.repairMarker(row);
        continue;
      }
      const result = await this.reminders.attempt(row, { now });
      counts = countReminderOutcome(counts, result);
    }
    if (capped) {
      this.logger.warn(
        `problem_sweep_batch_cap_reached phase=target_reminders batch=${problemSweepBatch} horizon=${horizon.toISOString()}`,
      );
    }
    const deferred = problems.length - processed;
    if (budgetReached) {
      this.logger.warn(
        `problem_sweep_budget_reached phase=target_reminders budget_ms=${problemSweepTickBudgetMilliseconds} processed=${processed} deferred=${deferred}`,
      );
    }
    return { processed, deferred, capped, budgetReached, counts };
  }
}
