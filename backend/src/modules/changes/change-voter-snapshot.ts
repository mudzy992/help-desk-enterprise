/**
 * BA-changes-06 (W7.47): a CAB round has one provable voter set and quorum.
 * The snapshot is written into the `status` event that opens the round (no new
 * table, no migration), so a later membership change cannot rewrite the round:
 * a member who joined after the round opened never votes in it, a member who
 * left keeps the vote they already cast, and the quorum stays what it was when
 * the round began.
 */
export type ChangeVoterSnapshot = {
  readonly round: number;
  readonly voters: readonly string[];
  readonly quorum: number;
};

const maxVoters = 100;

/**
 * Fail-closed reader of the persisted snapshot. Anything malformed reads as
 * `null`, and the caller falls back to the live (legacy) rule — never to an
 * empty voter set that would silently block a round.
 */
export function changeVoterSnapshotOf(detail: unknown): ChangeVoterSnapshot | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const raw = (detail as { voterSnapshot?: unknown }).voterSnapshot;
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as { round?: unknown; quorum?: unknown; voters?: unknown };
  if (typeof candidate.round !== 'number' || !Number.isInteger(candidate.round) || candidate.round < 1) return null;
  if (typeof candidate.quorum !== 'number' || !Number.isInteger(candidate.quorum) || candidate.quorum < 0) return null;
  if (!Array.isArray(candidate.voters)) return null;
  const voters: string[] = [];
  for (const value of candidate.voters) {
    if (typeof value !== 'string' || value.length === 0) return null;
    if (!voters.includes(value)) voters.push(value);
  }
  if (voters.length > maxVoters) return null;
  if (candidate.quorum > voters.length) return null;
  return { round: candidate.round, voters, quorum: candidate.quorum };
}

export function voterSnapshotSet(snapshot: ChangeVoterSnapshot): ReadonlySet<string> {
  return new Set(snapshot.voters);
}

/** Votes of users outside the frozen round never decide the round. */
export function countSnapshotVotes<T extends { readonly approverUserId: string | null; readonly decision: 'PENDING' | 'APPROVED' | 'REJECTED' }>(
  votes: readonly T[],
  snapshot: ChangeVoterSnapshot,
): T[] {
  const voters = voterSnapshotSet(snapshot);
  return votes.filter((vote) => vote.approverUserId !== null && voters.has(vote.approverUserId));
}
