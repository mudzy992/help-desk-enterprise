import { computeChangeQuorum, evaluateChangeVotes } from './change-cab';
import { detectChangeConflicts, hasWarnings, planChangeDowntime, planDowntimeRelease, windowsOverlap } from './change-conflicts';

const at = (hour: number, day = 5) => new Date(Date.UTC(2026, 9, day, hour));
const window = { start: at(18), end: at(20) };

describe('change conflicts and CAB (3.4)', () => {
  it('detects overlap with half-open windows', () => {
    expect(windowsOverlap(window, { start: at(19), end: at(21) })).toBe(true);
    expect(windowsOverlap(window, { start: at(20), end: at(21) })).toBe(false);
  });

  it('reports changes sharing a service or asset and foreign downtime', () => {
    const conflicts = detectChangeConflicts({
      changeId: 'c1',
      type: 'NORMAL',
      window,
      serviceIds: ['s1'],
      assetIds: ['a1'],
      candidates: [
        { id: 'c1', sequence: 1, title: 'self', status: 'SCHEDULED', start: at(18), end: at(20), serviceIds: ['s1'], assetIds: [] },
        { id: 'c2', sequence: 2, title: 'shares asset', status: 'SCHEDULED', start: at(19), end: at(22), serviceIds: ['s9'], assetIds: ['a1'] },
        { id: 'c3', sequence: 3, title: 'other service', status: 'SCHEDULED', start: at(19), end: at(22), serviceIds: ['s9'], assetIds: [] },
        { id: 'c4', sequence: 4, title: 'later', status: 'SCHEDULED', start: at(21), end: at(22), serviceIds: ['s1'], assetIds: [] },
      ],
      downtime: [
        { id: 'w1', serviceId: 's1', startsAt: at(17), endsAt: at(19), message: 'manual', changeRequestId: null },
        { id: 'w2', serviceId: 's1', startsAt: at(18), endsAt: at(20), message: 'own', changeRequestId: 'c1' },
        { id: 'w3', serviceId: 's2', startsAt: at(18), endsAt: at(20), message: 'other', changeRequestId: null },
      ],
      freezePeriods: [],
      timeZone: 'UTC',
    });
    expect(conflicts.changes.map((change) => change.id)).toEqual(['c2']);
    expect(conflicts.changes[0]?.sharedAssetIds).toEqual(['a1']);
    expect(conflicts.downtime.map((item) => item.id)).toEqual(['w1']);
    expect(hasWarnings(conflicts)).toBe(true);
  });

  it('lets the freeze block all but emergency changes', () => {
    const base = { changeId: null, window, serviceIds: [], assetIds: [], candidates: [], downtime: [], timeZone: 'UTC' };
    const freezePeriods = [{ from: '2026-10-05', to: '2026-10-05', label: 'Popis' }];
    expect(detectChangeConflicts({ ...base, type: 'NORMAL', freezePeriods }).freezeBlocks).toBe(true);
    const emergency = detectChangeConflicts({ ...base, type: 'EMERGENCY', freezePeriods });
    expect(emergency.freezeBlocks).toBe(false);
    expect(hasWarnings(emergency)).toBe(true);
  });

  it('plans downtime windows per service, skipping overlaps', () => {
    const plan = planChangeDowntime({
      window,
      serviceIds: ['s1', 's2', 's3'],
      own: [
        { id: 'o1', serviceId: 's1', startsAt: at(17), endsAt: at(19) },
        { id: 'o9', serviceId: 's9', startsAt: at(18), endsAt: at(20) },
      ],
      foreign: [{ serviceId: 's3', startsAt: at(19), endsAt: at(23) }],
    });
    expect(plan.create).toEqual(['s2']);
    expect(plan.update).toEqual([{ id: 'o1', startsAt: window.start, endsAt: window.end }]);
    expect(plan.delete).toEqual(['o9']);
    expect(plan.skipped).toEqual(['s3']);
  });

  it('releases future windows and ends a running one', () => {
    const plan = planDowntimeRelease(
      [
        { id: 'past', serviceId: 's1', startsAt: at(1), endsAt: at(2) },
        { id: 'running', serviceId: 's1', startsAt: at(18), endsAt: at(20) },
        { id: 'future', serviceId: 's2', startsAt: at(21), endsAt: at(22) },
      ],
      at(19),
    );
    expect(plan.delete).toEqual(['future']);
    expect(plan.update).toEqual([{ id: 'running', startsAt: at(18), endsAt: at(19) }]);
  });

  it('caps the quorum and evaluates votes', () => {
    const configuration = { normalQuorum: 2, emergencyQuorum: 1 };
    expect(computeChangeQuorum('NORMAL', configuration, 5)).toBe(2);
    expect(computeChangeQuorum('NORMAL', configuration, 1)).toBe(1);
    expect(computeChangeQuorum('EMERGENCY', configuration, 5)).toBe(1);
    expect(computeChangeQuorum('STANDARD', configuration, 5)).toBe(0);
    expect(evaluateChangeVotes([{ approverUserId: 'a', decision: 'APPROVED' }], 2)).toBe('PENDING');
    expect(
      evaluateChangeVotes(
        [
          { approverUserId: 'a', decision: 'APPROVED' },
          { approverUserId: 'b', decision: 'APPROVED' },
        ],
        2,
      ),
    ).toBe('APPROVED');
    expect(
      evaluateChangeVotes(
        [
          { approverUserId: 'a', decision: 'APPROVED' },
          { approverUserId: 'b', decision: 'REJECTED' },
        ],
        1,
      ),
    ).toBe('REJECTED');
  });
});
