import type { Prisma } from '../../../generated/prisma/client';
import { DatabaseLockService } from '../../../common/database-lock/database-lock.service';
import {
  DatabaseLockError,
  databaseLockErrorCodes,
} from '../../../common/database-lock/database-lock.error';
import { reportErrorCodes } from '../reports.constants';
import { ReportsError } from '../reports.error';

/**
 * W7.94 (`BA-reports-04`): `maxSchedules` used to be a `count()` followed by a `create()` with nothing between
 * them. Two administrators saving at the same moment both read `total = 49`, both pass the limit check, and the
 * installation ends up with 50 schedules under a limit of 50 — or 2 under a limit of 1. The check described a
 * state that had already stopped being true by the time the write landed.
 *
 * The fix is a transaction-scoped advisory lock around the read *and* the write. Every writer of the limit takes
 * the same key, so the second one waits, counts the row the first one committed (READ COMMITTED takes a fresh
 * snapshot per statement) and gets a clean `REPORT_SCHEDULE_LIMIT` instead of a silently over-filled table. The
 * lock is `pg_advisory_xact_lock`: released on commit, on rollback and on a dropped connection, so a crashed
 * request cannot leave the limit stuck.
 */
const databaseLocks = new DatabaseLockService();

/** One key for the whole installation: the limit is a global count, not a per-unit one. */
const scheduleLimitLockIdentity = { namespace: 'reports.schedule-limit', key: 'schedules' } as const;

/**
 * Two seconds, not the primitive's five: `create` runs in an interactive transaction whose default budget is
 * also five seconds, and a lock timeout that arrives after Prisma's own timeout would surface as an unmapped
 * `P2028` instead of the operational `REPORT_SCHEDULE_LIMIT_UNAVAILABLE`. The critical section is a count and
 * one insert, so waiting two seconds for it already means something is wrong.
 */
const scheduleLimitLockTimeoutMs = 2_000;

export async function withReportScheduleLimitLock<T>(
  transaction: Prisma.TransactionClient,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await databaseLocks.withAdvisoryLock(
      transaction,
      scheduleLimitLockIdentity,
      operation,
      scheduleLimitLockTimeoutMs,
    );
  } catch (error) {
    if (error instanceof DatabaseLockError && error.code === databaseLockErrorCodes.timeout) {
      throw new ReportsError(reportErrorCodes.scheduleLimitUnavailable);
    }
    throw error;
  }
}

/**
 * The critical section itself, shared by the service and the PostgreSQL integration spec so the spec proves the
 * production sequence instead of a copy of it.
 */
export function withReportScheduleLimit<T>(
  transaction: Prisma.TransactionClient,
  limits: { readonly maxSchedules: number },
  create: () => Promise<T>,
): Promise<T> {
  return withReportScheduleLimitLock(transaction, async () => {
    const total = await transaction.reportSchedule.count();
    if (total >= limits.maxSchedules) {
      throw new ReportsError(reportErrorCodes.scheduleLimit, { max: limits.maxSchedules });
    }
    return create();
  });
}
