import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { localHour } from '../../assets/reminders/plan-asset-reminders';
import { ProblemAccessService } from '../problem-access.service';
import { ProblemNotifier } from '../problem-notifier';
import { loadProblemTargetCalendar } from '../problem-target';
import { problemEventActions } from '../problems.constants';
import { planProblemReminder } from './plan-problem-reminders';
import { problemSweepBatch, problemSweepReminderStartHour } from './problem-sweep.constants';

export type ProblemSweepResult = {
  readonly skipped: string | null;
  readonly closed: number;
  readonly reminders: number;
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
    private readonly notifier: ProblemNotifier,
  ) {}

  async run(now: Date = new Date(), options: { readonly ignoreHour?: boolean } = {}): Promise<ProblemSweepResult> {
    if (!(await this.access.isEnabled())) return { skipped: 'module_disabled', closed: 0, reminders: 0 };
    const configuration = await this.access.configuration();
    const closed = configuration.autoCloseDays > 0 ? await this.autoClose(now, configuration.autoCloseDays) : 0;
    const reminders = configuration.targetEnabled ? await this.remind(now, configuration.targetCalendarId, options.ignoreHour === true) : 0;
    if (closed > 0 || reminders > 0) this.logger.log(`problem_sweep closed=${closed} reminders=${reminders}`);
    return { skipped: null, closed, reminders };
  }

  /** §5: RESOLVED -> CLOSED after N days without a reopen; recorded like a manual close, without an actor. */
  async autoClose(now: Date, days: number): Promise<number> {
    const before = new Date(now.getTime() - days * dayMs);
    const due = await this.prisma.problem.findMany({
      where: { status: 'RESOLVED', resolvedAt: { lte: before } },
      select: { id: true, version: true },
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
    const calendar = await loadProblemTargetCalendar(this.prisma, calendarId);
    if (calendar === null) return 0;
    if (!ignoreHour && localHour(now, calendar.timezone) < problemSweepReminderStartHour) return 0;
    const horizon = new Date(now.getTime() + 10 * dayMs);
    const problems = await this.prisma.problem.findMany({
      where: { status: { in: ['NEW', 'INVESTIGATING'] }, targetAt: { not: null, lte: horizon } },
      select: { id: true, targetAt: true, targetRemindersSent: true },
      orderBy: { targetAt: 'asc' },
      take: problemSweepBatch,
    });
    let sent = 0;
    for (const problem of problems) {
      const remindersSent = Array.isArray(problem.targetRemindersSent)
        ? problem.targetRemindersSent.filter((value): value is string => typeof value === 'string')
        : [];
      const stage = planProblemReminder(calendar, { targetAt: problem.targetAt as Date, remindersSent }, now);
      if (stage === null) continue;
      // Recorded first: a crash after this skips one reminder instead of repeating it forever.
      const marked = await this.prisma.problem.updateMany({
        where: { id: problem.id, targetAt: problem.targetAt },
        data: { targetRemindersSent: [...remindersSent, stage] },
      });
      if (marked.count === 0) continue;
      try {
        if ((await this.notifier.targetDue(problem.id, stage)) > 0) sent += 1;
      } catch (error) {
        this.logger.warn(`problem_target_reminder_failed problem=${problem.id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return sent;
  }
}
