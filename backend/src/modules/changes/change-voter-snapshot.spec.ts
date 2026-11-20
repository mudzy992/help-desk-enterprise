import { changeVoterSnapshotOf, countSnapshotVotes } from './change-voter-snapshot';
import { changeLimits } from './changes.constants';

describe('CAB voter snapshot (BA-changes-06)', () => {
  const snapshot = { round: 2, voters: ['u1', 'u2', 'u3'], quorum: 2 };

  it('reads a well-formed snapshot and drops duplicates', () => {
    expect(changeVoterSnapshotOf({ voterSnapshot: snapshot })).toEqual(snapshot);
    expect(
      changeVoterSnapshotOf({ voterSnapshot: { round: 1, quorum: 1, voters: ['u1', 'u1'] } }),
    ).toEqual({ round: 1, quorum: 1, voters: ['u1'] });
  });

  it('fails closed on a malformed snapshot instead of inventing an empty set', () => {
    const malformed = [
      null,
      {},
      { voterSnapshot: null },
      { voterSnapshot: { round: 0, quorum: 1, voters: ['u1'] } },
      { voterSnapshot: { round: 1.5, quorum: 1, voters: ['u1'] } },
      { voterSnapshot: { round: 1, quorum: -1, voters: ['u1'] } },
      { voterSnapshot: { round: 1, quorum: 2, voters: ['u1'] } },
      { voterSnapshot: { round: 1, quorum: 1, voters: 'u1' } },
      { voterSnapshot: { round: 1, quorum: 1, voters: ['u1', ''] } },
      { voterSnapshot: { round: 1, quorum: 1, voters: ['u1', 7] } },
      {
        voterSnapshot: {
          round: 1,
          quorum: 1,
          voters: Array.from({ length: changeLimits.cabVotersMax + 1 }, (_, index) => `u${index}`),
        },
      },
    ];
    for (const value of malformed) expect(changeVoterSnapshotOf(value)).toBeNull();
  });

  it('reads a frozen round with more than a hundred voters (W7.70)', () => {
    // The writer may freeze up to `changeLimits.cabVotersMax` voters now; a reader
    // that still stopped at 100 would answer `null` and silently fall back to
    // today's CAB, moving the quorum of a round that was already open.
    const voters = Array.from({ length: 150 }, (_, index) => `u${index}`);
    expect(changeVoterSnapshotOf({ voterSnapshot: { round: 3, voters, quorum: 120 } })).toEqual({
      round: 3,
      voters,
      quorum: 120,
    });
  });

  it('counts only the votes of the frozen voter set', () => {
    const votes = [
      { approverUserId: 'u1', decision: 'APPROVED' as const },
      { approverUserId: 'outsider', decision: 'REJECTED' as const },
      { approverUserId: null, decision: 'APPROVED' as const },
      { approverUserId: 'u3', decision: 'APPROVED' as const },
    ];

    expect(countSnapshotVotes(votes, snapshot)).toEqual([
      { approverUserId: 'u1', decision: 'APPROVED' },
      { approverUserId: 'u3', decision: 'APPROVED' },
    ]);
  });
});
