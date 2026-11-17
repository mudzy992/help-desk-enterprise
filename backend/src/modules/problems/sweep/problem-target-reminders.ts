import type { Prisma } from '../../../generated/prisma/client';
import {
  problemReminderBackoffMinutes,
  problemReminderClaimStaleMilliseconds,
  problemReminderMaxAttempts,
} from './problem-sweep.constants';

/**
 * W7.25 (BA-problems-07). The state machine of one target reminder, kept pure so
 * the transitions are testable without Prisma, a clock or a transport.
 *
 * A row is created PENDING before anything is sent, claimed before an attempt
 * (CLAIMED) and finalized only afterwards:
 *
 *   delivered > 0                      -> SENT          (marker written)
 *   nobody to notify                   -> NO_RECIPIENT  (marker written, final)
 *   failed, attempts < max             -> FAILED        (next attempt with backoff)
 *   failed, attempts = max             -> DEAD          (operator retry only)
 *   target re-armed / problem closed   -> CANCELLED     (no marker, no retry)
 *
 * Only SENT and NO_RECIPIENT append the stage to `Problem.targetRemindersSent`,
 * which is exactly the difference to the old code: the marker used to be written
 * first and the attempt afterwards, so a crash, zero eligible recipients or a
 * failed delivery lost the reminder permanently.
 */
export const problemTargetReminderStatuses = [
  'PENDING',
  'CLAIMED',
  'SENT',
  'NO_RECIPIENT',
  'FAILED',
  'DEAD',
  'CANCELLED',
] as const;

export type ProblemTargetReminderStatusValue = (typeof problemTargetReminderStatuses)[number];

/** Outcomes that append the stage to the legacy `targetRemindersSent` marker. */
export const problemReminderMarkerStatuses: readonly ProblemTargetReminderStatusValue[] = [
  'SENT',
  'NO_RECIPIENT',
];

export type ProblemReminderStageValue = 'before' | 'due' | 'overdue';

export const problemReminderStages: readonly ProblemReminderStageValue[] = ['before', 'due', 'overdue'];

export function isProblemReminderStage(value: unknown): value is ProblemReminderStageValue {
  return typeof value === 'string' && (problemReminderStages as readonly string[]).includes(value);
}

/** What one attempt produced; the notifier reports it, the state machine decides. */
export type ProblemReminderAttemptOutcome = {
  /** Recipients that got the in-app notification or an accepted e-mail. */
  readonly delivered: number;
  /** Recipients whose policy allowed at least one channel. 0 = nobody to notify. */
  readonly recipients: number;
  /** Recipients where an allowed channel failed. */
  readonly failures: number;
  readonly errorCode: string | null;
};

export type ProblemReminderDecision = {
  readonly status: ProblemTargetReminderStatusValue;
  readonly appendsMarker: boolean;
  readonly nextAttemptAt: Date | null;
  readonly errorCode: string | null;
};

export function reminderBackoffMilliseconds(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), problemReminderBackoffMinutes.length) - 1;
  const minutes = problemReminderBackoffMinutes[index] ?? problemReminderBackoffMinutes[0];
  return minutes * 60_000;
}

/** The outcome of a finished attempt, as the row and the marker must record it. */
export function decideProblemReminderOutcome(input: {
  readonly outcome: ProblemReminderAttemptOutcome;
  readonly attempts: number;
  readonly now: Date;
}): ProblemReminderDecision {
  const { outcome, attempts, now } = input;
  if (outcome.delivered > 0) {
    return { status: 'SENT', appendsMarker: true, nextAttemptAt: null, errorCode: null };
  }
  if (outcome.failures === 0 && outcome.recipients === 0) {
    return { status: 'NO_RECIPIENT', appendsMarker: true, nextAttemptAt: null, errorCode: null };
  }
  if (outcome.failures === 0) {
    // Allowed channels exist but nothing is confirmed and nothing failed: the
    // in-app row was already there (a replay) or an e-mail is still held by the
    // durable ledger. Neither is a delivery, so it stays retryable.
    return attempts >= problemReminderMaxAttempts
      ? { status: 'DEAD', appendsMarker: false, nextAttemptAt: null, errorCode: 'NOTHING_DELIVERED' }
      : {
          status: 'FAILED',
          appendsMarker: false,
          nextAttemptAt: new Date(now.getTime() + reminderBackoffMilliseconds(attempts)),
          errorCode: 'NOTHING_DELIVERED',
        };
  }
  const errorCode = (outcome.errorCode ?? 'DELIVERY_FAILED').slice(0, 32);
  if (attempts >= problemReminderMaxAttempts) {
    return { status: 'DEAD', appendsMarker: false, nextAttemptAt: null, errorCode };
  }
  return {
    status: 'FAILED',
    appendsMarker: false,
    nextAttemptAt: new Date(now.getTime() + reminderBackoffMilliseconds(attempts)),
    errorCode,
  };
}

/**
 * Claim filter: PENDING, a retry whose backoff elapsed, or a CLAIMED row whose
 * sweep died (stale). Terminal rows and rows that wait for their next attempt are
 * never picked up.
 */
export function dueReminderWhere(now: Date): Prisma.ProblemTargetReminderWhereInput {
  return {
    OR: [
      { status: 'PENDING' },
      { status: 'FAILED', nextAttemptAt: { lte: now } },
      { status: 'FAILED', nextAttemptAt: null },
      {
        status: 'CLAIMED',
        claimedAt: { lt: new Date(now.getTime() - problemReminderClaimStaleMilliseconds) },
      },
    ],
  };
}

/** Terminal rows are final; a problem leaves them untouched. */
export function isReminderTerminal(status: string): boolean {
  return (
    status === 'SENT' ||
    status === 'NO_RECIPIENT' ||
    status === 'DEAD' ||
    status === 'CANCELLED'
  );
}

/** Appends a stage to the legacy JSONB marker without duplicating it. */
export function appendReminderStage(existing: unknown, stage: ProblemReminderStageValue): string[] {
  const current = Array.isArray(existing)
    ? existing.filter((value): value is string => typeof value === 'string')
    : [];
  return current.includes(stage) ? current : [...current, stage];
}

/** Reads the legacy marker as the planner expects it. */
export function readReminderStages(existing: unknown): string[] {
  return Array.isArray(existing)
    ? existing.filter((value): value is string => typeof value === 'string')
    : [];
}
