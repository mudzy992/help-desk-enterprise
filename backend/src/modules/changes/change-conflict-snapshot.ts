import { createHash } from 'node:crypto';
import { changeConflictsTruncated, type ChangeConflicts, type ChangeConflictTruncation, type ConflictWindow } from './change-conflicts';

/**
 * W7.68 (`BA-changes-12`): an acknowledgement is only meaningful for the exact
 * set of conflicts the approver saw. The preview therefore returns a digest of
 * the decidable facts (window, conflicting change windows, downtime windows and
 * the freeze), the action must echo it, and the server recomputes it inside the
 * write transaction. A conflict that appeared in between changes the digest, so
 * the write is refused instead of acknowledging a snapshot nobody reviewed.
 *
 * The digest is also what the history keeps: it proves *what* was acknowledged
 * without copying titles, messages or other free text into the change record.
 */
export type ChangeConflictSnapshot = {
  readonly hash: string;
  readonly window: { readonly start: string; readonly end: string };
  readonly changes: number;
  readonly downtime: number;
  readonly freeze: string | null;
  readonly freezeBlocks: boolean;
  readonly hasWarnings: boolean;
  /**
   * W7.76 (`BA-changes-18`): whether the scan behind this digest was cut. It is
   * part of the digest, so a preview taken while the scan was capped cannot be
   * acknowledged after the cap is lifted (or the other way round).
   */
  readonly truncated: ChangeConflictTruncation;
};

type CanonicalFacts = {
  readonly w: readonly [string, string];
  readonly c: readonly (readonly [string, string, string])[];
  readonly d: readonly (readonly [string, string, string, string, string])[];
  readonly f: readonly [string, string, string, boolean] | null;
  readonly t: readonly [boolean, boolean];
};

function iso(value: Date): string {
  return value.toISOString();
}

/**
 * Deterministic facts: ids and instants only, sorted so neither the query order
 * nor the locale can change the digest. Names, titles and downtime messages are
 * deliberately excluded — they are free text and they are not part of the
 * decision.
 */
function canonicalFacts(conflicts: ChangeConflicts, window: ConflictWindow): CanonicalFacts {
  const changes = conflicts.changes
    .map((row) => [row.id, iso(row.start), iso(row.end)] as const)
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  const downtime = conflicts.downtime
    .map(
      (row) =>
        [
          row.id,
          row.serviceId,
          iso(row.startsAt),
          iso(row.endsAt),
          row.changeRequestId ?? '',
        ] as const,
    )
    .sort((left, right) => left[0].localeCompare(right[0]));
  const freeze =
    conflicts.freeze === null
      ? null
      : ([conflicts.freeze.label, conflicts.freeze.from, conflicts.freeze.to, conflicts.freezeBlocks] as const);
  const truncated = conflicts.truncated ?? { changes: false, downtime: false };
  return {
    w: [iso(window.start), iso(window.end)],
    c: changes,
    d: downtime,
    f: freeze,
    t: [truncated.changes, truncated.downtime] as const,
  };
}

export function changeConflictSnapshot(
  conflicts: ChangeConflicts,
  window: ConflictWindow,
): ChangeConflictSnapshot {
  const facts = canonicalFacts(conflicts, window);
  const hash = createHash('sha256').update(JSON.stringify(facts)).digest('hex');
  return {
    hash,
    window: { start: facts.w[0], end: facts.w[1] },
    changes: facts.c.length,
    downtime: facts.d.length,
    freeze: facts.f === null ? null : facts.f[0],
    freezeBlocks: conflicts.freezeBlocks,
    hasWarnings:
      conflicts.changes.length > 0 ||
      conflicts.downtime.length > 0 ||
      changeConflictsTruncated(conflicts) ||
      (conflicts.freeze !== null && !conflicts.freezeBlocks),
    truncated: conflicts.truncated ?? { changes: false, downtime: false },
  };
}

export const changeConflictSnapshotHashPattern = /^[a-f0-9]{64}$/;
