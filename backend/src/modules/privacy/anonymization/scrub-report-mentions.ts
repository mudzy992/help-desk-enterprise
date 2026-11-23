import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  collectReportMentions,
  stripSkippedUserIds,
  type ReportMentionScope,
} from './report-mentions';

export type ReportMentionCounts = {
  /** Runs where the person pressed "send now". */
  readonly reportRunsDetached: number;
  /** Runs whose `skipped` JSON listed the person as a skipped recipient. */
  readonly reportRunSkipped: number;
  /** Schedules the person created or last changed. */
  readonly reportSchedulesDetached: number;
};

/**
 * W7.104 (`BA-reports-13`): writes the report part of an anonymisation.
 *
 * - A run keeps its period, status, counters and reasons; only the identity goes. `triggeredByUserId` becomes
 *   `NULL`, and `skipped` entries lose their `userId` (the reason stays, so "one recipient was inactive" remains
 *   readable without saying who).
 * - A schedule keeps its content, recipients, scope and history; only `createdByUserId`/`updatedByUserId` become
 *   `NULL`. The two columns are cleared separately, so updating somebody else's schedule cannot erase its creator.
 *
 * Everything is `updateMany` with the person's id in the predicate, so a second pass writes nothing and two
 * workers cannot loop.
 */
export async function scrubReportMentions(input: {
  readonly prisma: PrismaService;
  readonly userId: string;
  /** The selection the preview already showed; passing it keeps preview and execution identical. */
  readonly scope?: ReportMentionScope;
}): Promise<ReportMentionCounts> {
  const { prisma, userId } = input;
  const scope = input.scope ?? (await collectReportMentions({ prisma, userId }));

  let reportRunsDetached = 0;
  if (scope.runsTriggered.length > 0) {
    const detached = await prisma.reportScheduleRun.updateMany({
      where: { triggeredByUserId: userId },
      data: { triggeredByUserId: null },
    });
    reportRunsDetached = detached.count;
  }

  let reportRunSkipped = 0;
  for (const run of scope.runsWithSkipped) {
    const stripped = stripSkippedUserIds(run.skipped, userId);
    if (stripped.removed === 0) continue;
    await prisma.reportScheduleRun.update({
      where: { id: run.id },
      data: { skipped: stripped.value as never },
    });
    reportRunSkipped += 1;
  }

  let reportSchedulesDetached = 0;
  if (scope.schedulesCreated.length > 0) {
    const created = await prisma.reportSchedule.updateMany({
      where: { createdByUserId: userId },
      data: { createdByUserId: null },
    });
    reportSchedulesDetached += created.count;
  }
  if (scope.schedulesUpdated.length > 0) {
    const updated = await prisma.reportSchedule.updateMany({
      where: { updatedByUserId: userId },
      data: { updatedByUserId: null },
    });
    reportSchedulesDetached += updated.count;
  }

  return { reportRunsDetached, reportRunSkipped, reportSchedulesDetached };
}
