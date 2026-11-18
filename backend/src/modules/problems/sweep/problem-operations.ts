import type { Prisma } from '../../../generated/prisma/client';
import { problemReminderClaimStaleMilliseconds } from './problem-sweep.constants';

/**
 * W7.32 (BA-problems-14): the health inputs of the problem module, kept next to
 * the sweep that owns them so the alarm and the sweep read the same definition
 * of "this should already have happened".
 *
 * A target reminder is **stuck** when the hourly sweep should have moved it and
 * did not: it burned every attempt (DEAD), its retry backoff elapsed, its retry
 * has no schedule at all, or a claim outlived a crashed sweep. PENDING rows are
 * not stuck — they wait for their target on purpose.
 */
export type ProblemOperationsSignal = {
  /** DEAD rows plus retries/claims the sweep should already have picked up. */
  readonly stuckReminderDeliveries: number;
  /** The subset that is terminal (operator retry only). */
  readonly deadReminderDeliveries: number;
  /** Age of the oldest stuck row; null when nothing is stuck. */
  readonly oldestStuckReminderMinutes: number | null;
  /**
   * Open problems (`NEW`, `INVESTIGATING`, `KNOWN_ERROR`) whose target passed:
   * the overdue backlog. It travels as alarm detail instead of its own alarm —
   * a breach is workload, not a fault, and an alarm without an owner-agreed
   * threshold would only train people to ignore it.
   */
  readonly breachedOpenTargets: number;
  /**
   * W7.40 (BA-problems-18): the **starvation** measurement the count alone cannot
   * give. The sweep takes 500 problems per tick, oldest target first; as long as
   * it keeps up, the oldest breach is younger than the tick cadence. A number
   * that keeps growing says the tick no longer reaches the tail of its batch —
   * the backlog is not just big, it is being processed too slowly.
   */
  readonly oldestOverdueTargetMinutes: number | null;
  /**
   * W7.40: `RESOLVED` problems already past `autoCloseDays` and still open. Zero
   * is the healthy value; a number that grows hour after hour means the
   * auto-close phase is not finishing its batch. Null when the setting could not
   * be read — an unknown deadline must not read as "nothing is due".
   */
  readonly autoCloseDue: number | null;
  /** W7.40: minutes since the oldest due problem passed its auto-close deadline. */
  readonly oldestAutoCloseDueMinutes: number | null;
  /**
   * W7.40: the effective (clamped) `autoCloseDays`, so the two numbers above can
   * be read without opening the settings page, and a clamped out-of-band value is
   * visible instead of silently applied. Null when the setting could not be read.
   */
  readonly effectiveAutoCloseDays: number | null;
};

/**
 * W7.40 (BA-problems-18): the auto-close backlog definition, shared by the sweep
 * (which closes these rows) and the health probe (which counts them), so the two
 * can never disagree. `days = 0` means auto-close is off: nothing is due.
 */
export function autoCloseDueWhere(now: Date, days: number): Prisma.ProblemWhereInput | null {
  if (days <= 0) return null;
  return { status: 'RESOLVED', resolvedAt: { lte: new Date(now.getTime() - days * 86_400_000) } };
}

/** Statuses that are still worked on; RESOLVED/CLOSED/CANCELLED are done. */
export const problemOpenTargetStatuses = ['NEW', 'INVESTIGATING', 'KNOWN_ERROR'] as const;

export function stuckProblemReminderWhere(now: Date): Prisma.ProblemTargetReminderWhereInput {
  return {
    OR: [
      // Every attempt failed; only an operator can retry it.
      { status: 'DEAD' },
      // The backoff elapsed (or was never scheduled) and no run picked it up.
      { status: 'FAILED', nextAttemptAt: { lte: now } },
      { status: 'FAILED', nextAttemptAt: null },
      // A claim older than a crashed sweep; the next run reclaims it.
      { status: 'CLAIMED', claimedAt: { lt: new Date(now.getTime() - problemReminderClaimStaleMilliseconds) } },
    ],
  };
}

export function breachedProblemTargetWhere(now: Date): Prisma.ProblemWhereInput {
  return {
    status: { in: [...problemOpenTargetStatuses] },
    targetAt: { lt: now },
  };
}
