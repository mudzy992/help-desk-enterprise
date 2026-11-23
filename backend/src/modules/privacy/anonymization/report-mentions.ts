import type { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * W7.104 (`BA-reports-13`): the report part of an anonymisation, selected in one place so the preview and the
 * execution read exactly the same rows.
 *
 * Three surfaces in `reports` can still point at a person after their account is anonymised:
 *
 * 1. `ReportScheduleRun.triggeredByUserId` — who pressed "send now";
 * 2. `ReportScheduleRun.skipped` — `[{ userId, reason }]`, one entry per recipient who was skipped (inactive,
 *    without access, address not allowed, delivery failed/unknown). The JSON keeps a raw user id for 180 days;
 * 3. `ReportSchedule.createdByUserId` / `updatedByUserId` — who created or last changed the schedule.
 *
 * The recipients themselves (`ReportScheduleRecipient`) are deleted by the executor, and the schedules left
 * without one are paused, so those are not part of this selection.
 *
 * `skipped` is JSON, and Prisma cannot express "an element of this array has `userId = x`" portably, so the
 * selection is one `jsonb` containment query: `skipped @> '[{"userId": …}]'` matches any entry of the array whose
 * object contains that id, whatever its `reason`.
 */
export type ReportRunWithSkipped = {
  readonly id: string;
  readonly skipped: unknown;
};

export type ReportMentionScope = {
  readonly runsTriggered: readonly { readonly id: string }[];
  readonly runsWithSkipped: readonly ReportRunWithSkipped[];
  readonly schedulesCreated: readonly { readonly id: string }[];
  readonly schedulesUpdated: readonly { readonly id: string }[];
};

export async function collectReportMentions(input: {
  readonly prisma: PrismaService;
  readonly userId: string;
}): Promise<ReportMentionScope> {
  const { prisma, userId } = input;
  const [runsTriggered, runsWithSkipped, schedulesCreated, schedulesUpdated] = await Promise.all([
    prisma.reportScheduleRun.findMany({
      where: { triggeredByUserId: userId },
      select: { id: true },
    }),
    prisma.$queryRaw<ReportRunWithSkipped[]>`
      SELECT "id", "skipped"
      FROM "ReportScheduleRun"
      WHERE "skipped" @> ${JSON.stringify([{ userId }])}::jsonb
    `,
    prisma.reportSchedule.findMany({
      where: { createdByUserId: userId },
      select: { id: true },
    }),
    prisma.reportSchedule.findMany({
      where: { updatedByUserId: userId },
      select: { id: true },
    }),
  ]);
  return { runsTriggered, runsWithSkipped, schedulesCreated, schedulesUpdated };
}

/** A `skipped` array with the person's entries reduced to their reason. Idempotent: a second pass changes nothing. */
export function stripSkippedUserIds(
  skipped: unknown,
  userId: string,
): { readonly value: readonly unknown[]; readonly removed: number } {
  const entries = Array.isArray(skipped) ? skipped : [];
  let removed = 0;
  const value = entries.map((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const record = entry as Record<string, unknown>;
    if (record.userId !== userId) return entry;
    removed += 1;
    const { userId: _dropped, ...rest } = record;
    return rest;
  });
  return { value, removed };
}
