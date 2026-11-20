import { changeConflictSnapshot } from './change-conflict-snapshot';
import type { ChangeConflicts } from './change-conflicts';

const window = {
  start: new Date('2030-05-01T10:00:00.000Z'),
  end: new Date('2030-05-01T12:00:00.000Z'),
};

function conflicts(overrides: Partial<ChangeConflicts> = {}): ChangeConflicts {
  return {
    changes: [
      {
        id: 'change-2',
        sequence: 12,
        title: 'Mrežni prekid',
        status: 'SCHEDULED',
        start: new Date('2030-05-01T11:00:00.000Z'),
        end: new Date('2030-05-01T12:00:00.000Z'),
        serviceIds: ['service-1'],
        assetIds: [],
        sharedServiceIds: ['service-1'],
        sharedAssetIds: [],
      },
    ],
    downtime: [
      {
        id: 'downtime-1',
        serviceId: 'service-1',
        startsAt: new Date('2030-05-01T10:00:00.000Z'),
        endsAt: new Date('2030-05-01T10:30:00.000Z'),
        message: 'CHG000012: Mrežni prekid',
        changeRequestId: 'change-2',
      },
    ],
    freeze: null,
    freezeBlocks: false,
    ...overrides,
  };
}

describe('change conflict snapshot (W7.68, BA-changes-12)', () => {
  it('digests ids and instants, so the same conflicts always hash the same', () => {
    const first = changeConflictSnapshot(conflicts(), window);
    const second = changeConflictSnapshot(conflicts(), window);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(first).toMatchObject({
      window: { start: '2030-05-01T10:00:00.000Z', end: '2030-05-01T12:00:00.000Z' },
      changes: 1,
      downtime: 1,
      freeze: null,
      freezeBlocks: false,
      hasWarnings: true,
    });
  });

  it('ignores query order, so a re-sorted read is not mistaken for new evidence', () => {
    const base = conflicts();
    const reordered = conflicts({
      changes: [...base.changes].reverse(),
      downtime: [...base.downtime].reverse(),
    });
    expect(changeConflictSnapshot(reordered, window).hash).toBe(
      changeConflictSnapshot(base, window).hash,
    );
  });

  it('does not digest free text: titles and downtime messages are not the decision', () => {
    const renamed = conflicts({
      changes: [{ ...conflicts().changes[0], title: 'Sasvim drugi naslov' }],
      downtime: [{ ...conflicts().downtime[0], message: 'Druga poruka' }],
    });
    expect(changeConflictSnapshot(renamed, window).hash).toBe(
      changeConflictSnapshot(conflicts(), window).hash,
    );
  });

  it('changes when another change takes the slot', () => {
    const extra = conflicts({
      changes: [
        ...conflicts().changes,
        {
          id: 'change-3',
          sequence: 13,
          title: 'Novi prekid',
          status: 'AUTHORIZATION' as const,
          start: window.start,
          end: window.end,
          serviceIds: ['service-1'],
          assetIds: [],
          sharedServiceIds: ['service-1'],
          sharedAssetIds: [],
        },
      ],
    });
    expect(changeConflictSnapshot(extra, window).hash).not.toBe(
      changeConflictSnapshot(conflicts(), window).hash,
    );
  });

  it('changes when a downtime window moves by one minute', () => {
    const moved = conflicts({
      downtime: [
        {
          ...conflicts().downtime[0],
          endsAt: new Date('2030-05-01T10:31:00.000Z'),
        },
      ],
    });
    expect(changeConflictSnapshot(moved, window).hash).not.toBe(
      changeConflictSnapshot(conflicts(), window).hash,
    );
  });

  it('changes when the requested window moves, and keeps a freeze readable', () => {
    const freeze = { label: 'Zatvaranje kvartala', from: '2030-05-01', to: '2030-05-02' };
    const withFreeze = conflicts({ freeze, freezeBlocks: false });
    const snapshot = changeConflictSnapshot(withFreeze, window);
    expect(snapshot.freeze).toBe('Zatvaranje kvartala');
    expect(changeConflictSnapshot(withFreeze, window).hash).not.toBe(
      changeConflictSnapshot(conflicts(), window).hash,
    );
    expect(
      changeConflictSnapshot(withFreeze, {
        start: new Date('2030-05-02T10:00:00.000Z'),
        end: new Date('2030-05-02T12:00:00.000Z'),
      }).hash,
    ).not.toBe(snapshot.hash);
    // A blocking freeze never reaches an acknowledgement, but the digest still
    // distinguishes it from a warning-only freeze.
    expect(changeConflictSnapshot(conflicts({ freeze, freezeBlocks: true }), window).hash).not.toBe(
      snapshot.hash,
    );
  });
});
