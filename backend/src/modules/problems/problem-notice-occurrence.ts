import { createHash } from 'node:crypto';

/**
 * W7.31 (BA-problems-13): the dedupe identity of a problem notice.
 *
 * The in-app row and the e-mail ledger dedupe on
 * `problem:<type>:<problemId>:<occurrence>:<userId>`. While the occurrence was
 * `Date.now()` (or a random UUID), a retried business event produced a new key
 * and therefore a second message. The occurrence is now derived from the
 * identity of the change being announced:
 *
 * - a versioned problem write (owner, group, status) → the problem version the
 *   write produced;
 * - a new problem → `created` (a problem is created once);
 * - a handoff step → the handoff id;
 * - a resolution run → the run id plus the announced status;
 * - a target reminder → the stage and the target it belongs to;
 * - a recurrence → a digest of the linked ticket references (the identifiers
 *   themselves never enter the dedupe payload).
 *
 * Nothing here reads the clock: replaying the same notice with the same input
 * produces the same key, so the second attempt finds the existing row.
 */
export type ProblemNoticeOccurrence = { readonly key: string };

function occurrence(key: string): ProblemNoticeOccurrence {
  if (key.length === 0) throw new Error('PROBLEM_NOTICE_OCCURRENCE_EMPTY');
  return Object.freeze({ key });
}

/** A problem is created once; a replayed create must not notify twice. */
export const problemCreatedOccurrence: ProblemNoticeOccurrence = occurrence('created');

/** Owner/group/status announcements of a versioned problem write. */
export function problemVersionOccurrence(version: number): ProblemNoticeOccurrence {
  if (!Number.isInteger(version) || version < 0) throw new Error('PROBLEM_NOTICE_OCCURRENCE_VERSION_INVALID');
  return occurrence(`v${version}`);
}

/** A handoff step; the id is stable across retries and replays of that step. */
export function problemHandoffOccurrence(handoffId: string): ProblemNoticeOccurrence {
  return occurrence(`handoff:${handoffId}`);
}

/** A resolution run completion; replaying the same run keeps the same key. */
export function problemResolutionRunOccurrence(runId: string, status: string): ProblemNoticeOccurrence {
  return occurrence(`run:${runId}:${status}`);
}

/** A scheduled reminder belongs to one target and stage. */
export function problemTargetDueOccurrence(stage: string, targetAt: Date): ProblemNoticeOccurrence {
  return occurrence(`target:${stage}:${targetAt.toISOString()}`);
}

/**
 * A recurrence is the link event that brought tickets back. The key is a digest
 * of the ticket references, so the same link command replays to the same key
 * while the payload never carries a ticket identifier.
 */
export function problemRecurrenceOccurrence(ticketRefs: readonly string[]): ProblemNoticeOccurrence {
  if (ticketRefs.length === 0) throw new Error('PROBLEM_NOTICE_OCCURRENCE_RECURRENCE_EMPTY');
  const digest = createHash('sha256').update([...ticketRefs].sort().join('\n')).digest('hex').slice(0, 32);
  return occurrence(`recurrence:${digest}`);
}
