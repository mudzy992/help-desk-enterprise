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
};

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
