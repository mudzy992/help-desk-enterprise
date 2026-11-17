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
import { problemSweepBatch, problemSweepReminderStartHour } from './problem-sweep.constants';

export type ProblemSweepResult = {
  readonly skipped: string | null;
  readonly closed: number;
  readonly reminders: number;
  /** W7.25: per-outcome detail, so a lost reminder is not reported as "sent". */
  readonly reminderOutcomes: ProblemReminderSweepCounts;
};

const dayMs = 86_400_000;

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

  async run(now: Date = new Date(), options: { readonly ignoreHour?: boolean } = {}): Promise<ProblemSweepResult> {
    if (!(await this.access.isEnabled())) {
      return { skipped: 'module_disabled', closed: 0, reminders: 0, reminderOutcomes: emptyProblemReminderCounts };
    }
    const configuration = await this.access.configuration();
    const closed = configuration.autoCloseDays > 0 ? await this.autoClose(now, configuration.autoCloseDays) : 0;
    const reminderOutcomes = configuration.targetEnabled
      ? await this.remindDetailed(now, configuration.targetCalendarId, options.ignoreHour === true)
      : emptyProblemReminderCounts;
    if (closed > 0 || reminderOutcomes.attempted > 0) {
      this.logger.log(
        `problem_sweep closed=${closed} reminders_sent=${reminderOutcomes.sent} reminders_no_recipient=${reminderOutcomes.noRecipient} reminders_failed=${reminderOutcomes.failed} reminders_dead=${reminderOutcomes.dead} reminders_cancelled=${reminderOutcomes.cancelled}`,
      );
    }
    return { skipped: null, closed, reminders: reminderOutcomes.sent, reminderOutcomes };
  }

  /** §5: RESOLVED -> CLOSED after N days without a reopen; recorded like a manual close, without an actor. */
  async autoClose(now: Date, days: number): Promise<number> {
    const before = new Date(now.getTime() - days * dayMs);
    const due = await this.prisma.problem.findMany({
      where: { status: 'RESOLVED', resolvedAt: { lte: before } },
      select: { id: true, version: true, organizationalUnitId: true },
      orderBy: { resolvedAt: 'asc' },
      take: problemSweepBatch,
    });
    let closed = 0;
    for (const problem of due) {
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
    return closed;
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
    const calendar = await loadProblemTargetCalendar(this.prisma, calendarId);
    if (calendar === null) return emptyProblemReminderCounts;
    if (!ignoreHour && localHour(now, calendar.timezone) < problemSweepReminderStartHour) {
      return emptyProblemReminderCounts;
    }
    let counts = await this.reminders.retryDue(now, problemSweepBatch);
    const horizon = new Date(now.getTime() + 10 * dayMs);
    const problems = await this.prisma.problem.findMany({
      where: { status: { in: ['NEW', 'INVESTIGATING'] }, targetAt: { not: null, lte: horizon } },
      select: { id: true, targetAt: true, targetRemindersSent: true },
      orderBy: { targetAt: 'asc' },
      take: problemSweepBatch,
    });
    for (const problem of problems) {
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
    return counts;
  }
}
