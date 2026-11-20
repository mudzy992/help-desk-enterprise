import type { PrismaService } from "../../common/prisma/prisma.service";
import type { ChangeDowntimeDriftMetricStore } from "../changes/change-downtime-drift-metrics";
import {
  changeDueReminderWhere,
  changeOverdueBacklogWhere,
  changeSkippedServiceWindowMs,
  changeUpcomingWindowWhere,
  type ChangeOperationsSignal,
} from "../changes/change-operations";
import { changeReminderDispatchTopic } from "../changes/sweep/change-reminder-outbox";
import { changeEventActions } from "../changes/changes.constants";

export type ChangeOperationsPrisma = Pick<
  PrismaService,
  "changeRequest" | "outboxMessage" | "$queryRaw"
>;

export type ChangeOperationsOptions = Readonly<{
  /**
   * The effective (already clamped) `reminderHoursBeforeStart`. `null` means the
   * setting could not be read, which is a different fact from `0` (reminders
   * switched off) and is reported as such.
   */
  readonly reminderHoursBeforeStart: number | null;
  /**
   * A drift pass older than this is not evidence about "now" — the worker may be
   * down — so the pass is reported as `null` instead of a stale number.
   */
  readonly driftPassMaxAgeMs: number;
}>;

type SkippedRow = { readonly count: bigint | number };

/**
 * W7.69 (`BA-changes-13`): what the change sweep and the downtime outbox left
 * behind. The queue health says whether the jobs run; this says whether the
 * reminders, the overrun warnings and the availability calendar actually match
 * the plan.
 */
export async function collectChangeOperationsSignal(
  prisma: ChangeOperationsPrisma,
  driftMetrics: Pick<ChangeDowntimeDriftMetricStore, "read"> | null,
  now: Date,
  options: ChangeOperationsOptions,
): Promise<ChangeOperationsSignal> {
  const hours = options.reminderHoursBeforeStart;
  const dueWhere = hours === null || hours <= 0 ? null : changeDueReminderWhere(now, hours);
  const overdueWhere = changeOverdueBacklogWhere(now);
  const deliveryWhere = { topic: changeReminderDispatchTopic };
  const skippedSince = new Date(now.getTime() - changeSkippedServiceWindowMs);
  const [upcoming24h, due, overdue, oldestOverdue, pending, processing, deadLetter, oldestPending, skipped, lastPass] =
    await Promise.all([
      prisma.changeRequest.count({ where: changeUpcomingWindowWhere(now) }),
      dueWhere === null ? Promise.resolve(null) : prisma.changeRequest.count({ where: dueWhere }),
      prisma.changeRequest.count({ where: overdueWhere }),
      prisma.changeRequest.findFirst({
        where: overdueWhere,
        orderBy: { plannedEnd: "asc" },
        select: { plannedEnd: true },
      }),
      prisma.outboxMessage.count({ where: { ...deliveryWhere, status: "PENDING" } }),
      prisma.outboxMessage.count({ where: { ...deliveryWhere, status: "PROCESSING" } }),
      prisma.outboxMessage.count({ where: { ...deliveryWhere, status: "DEAD_LETTER" } }),
      prisma.outboxMessage.findFirst({
        where: { ...deliveryWhere, status: { in: ["PENDING", "PROCESSING"] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      countSkippedServices(prisma, skippedSince),
      readDriftPass(driftMetrics, now, options.driftPassMaxAgeMs),
    ]);

  return {
    reminders: {
      upcoming24h,
      dueReminders: hours === null ? null : (due ?? 0),
      overdueOpen: overdue,
      oldestOverdueMinutes:
        oldestOverdue?.plannedEnd == null
          ? null
          : Math.max(0, Math.floor((now.getTime() - oldestOverdue.plannedEnd.getTime()) / 60_000)),
      reminderHoursBeforeStart: hours,
    },
    delivery: {
      pending,
      processing,
      deadLetter,
      oldestPendingMinutes:
        oldestPending?.createdAt == null
          ? null
          : Math.max(0, Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 60_000)),
    },
    downtime: {
      skippedServices24h: skipped,
      lastPass,
    },
  };
}

/**
 * A window left empty because a foreign window already covers the service is a
 * plan outcome (the event records `skippedServiceIds`), but an operator still has
 * to see how often it happens. Read from the history with one bounded count;
 * `detail` is JSON, so the emptiness test lives in SQL.
 */
async function countSkippedServices(
  prisma: ChangeOperationsPrisma,
  since: Date,
): Promise<number> {
  const rows = await prisma.$queryRaw<SkippedRow[]>`
    SELECT count(*)::bigint AS count
    FROM "ChangeEvent"
    WHERE "action" = ${changeEventActions.downtime}
      AND "createdAt" >= ${since}
      AND jsonb_array_length(COALESCE("detail" -> 'skippedServiceIds', '[]'::jsonb)) > 0
  `;
  const value = rows[0]?.count ?? 0;
  return typeof value === "bigint" ? Number(value) : value;
}

async function readDriftPass(
  driftMetrics: Pick<ChangeDowntimeDriftMetricStore, "read"> | null,
  now: Date,
  maxAgeMs: number,
): Promise<ChangeOperationsSignal["downtime"]["lastPass"]> {
  if (driftMetrics === null) return null;
  try {
    const pass = await driftMetrics.read();
    if (pass === null) return null;
    // A record older than the budget means the reconciler stopped; a stale
    // number would claim "no drift" about a moment nobody scanned.
    if (now.getTime() - pass.completedAtMs > maxAgeMs) return null;
    return pass;
  } catch {
    return null;
  }
}
