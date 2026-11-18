import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  breachedProblemTargetWhere,
  stuckProblemReminderWhere,
  type ProblemOperationsSignal,
} from '../problems/sweep/problem-operations';

export type ProblemOperationsPrisma = Pick<PrismaService, 'problemTargetReminder' | 'problem'>;

/**
 * W7.32 (BA-problems-14): read-only, privacy-safe state of the problem sweep's
 * *outcomes*. The queue health says whether the hourly job runs; this says what
 * it left behind — reminders that never left and targets nobody can still reach.
 * Both are counts and one age, never a problem id or a recipient.
 */
export async function collectProblemOperationsSignal(
  prisma: ProblemOperationsPrisma,
  now: Date,
): Promise<ProblemOperationsSignal> {
  const stuckWhere = stuckProblemReminderWhere(now);
  const [stuck, dead, oldestStuck, breached] = await Promise.all([
    prisma.problemTargetReminder.count({ where: stuckWhere }),
    prisma.problemTargetReminder.count({ where: { status: 'DEAD' } }),
    prisma.problemTargetReminder.findFirst({
      where: stuckWhere,
      orderBy: { updatedAt: 'asc' },
      select: { updatedAt: true },
    }),
    prisma.problem.count({ where: breachedProblemTargetWhere(now) }),
  ]);
  return {
    stuckReminderDeliveries: stuck,
    deadReminderDeliveries: dead,
    oldestStuckReminderMinutes:
      oldestStuck?.updatedAt == null
        ? null
        : Math.max(0, Math.floor((now.getTime() - oldestStuck.updatedAt.getTime()) / 60_000)),
    breachedOpenTargets: breached,
  };
}
