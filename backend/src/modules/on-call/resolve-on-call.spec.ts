import { listOnCallSegments, overridesOverlap, resolveOnCall, rotationShiftAt, type OnCallScheduleShape } from './resolve-on-call';

const tz = 'Europe/Sarajevo';
const weekly: OnCallScheduleShape = {
  timezone: tz,
  handoffMinute: 480,
  rotationLength: 'WEEK',
  rotationStartDate: '2026-03-02', // Monday
  isActive: true,
};
const members = [
  { userId: 'ana', position: 0, isAvailable: true },
  { userId: 'bojan', position: 1, isAvailable: true },
  { userId: 'cazim', position: 2, isAvailable: true },
];

describe('resolveOnCall (Paket 2.9 K3)', () => {
  it('rotates weekly at the local hand-off time', () => {
    expect(resolveOnCall(weekly, members, [], new Date('2026-03-02T07:00:00Z')).userId).toBe('ana'); // 08:00 CET
    expect(resolveOnCall(weekly, members, [], new Date('2026-03-09T06:59:00Z')).userId).toBe('ana');
    expect(resolveOnCall(weekly, members, [], new Date('2026-03-09T07:00:00Z')).userId).toBe('bojan');
    expect(resolveOnCall(weekly, members, [], new Date('2026-03-23T07:00:00Z')).userId).toBe('ana');
  });

  it('nobody before the first shift', () => {
    const result = resolveOnCall(weekly, members, [], new Date('2026-03-02T06:59:00Z'));
    expect(result).toMatchObject({ userId: null, source: 'none' });
  });

  it('keeps the wall-clock hand-off across the March and October DST changes', () => {
    // DST starts 2026-03-29 (Sunday): Monday 30th 08:00 CEST = 06:00Z.
    const march = rotationShiftAt(weekly, new Date('2026-03-30T06:30:00Z'))!;
    expect(march.startsAt.toISOString()).toBe('2026-03-30T06:00:00.000Z');
    expect(resolveOnCall(weekly, members, [], new Date('2026-03-30T05:59:00Z')).userId).toBe('ana');
    expect(resolveOnCall(weekly, members, [], new Date('2026-03-30T06:00:00Z')).userId).toBe('bojan');
    // DST ends 2026-10-25: Monday 26th 08:00 CET = 07:00Z.
    const daily: OnCallScheduleShape = { ...weekly, rotationLength: 'DAY', rotationStartDate: '2026-10-24' };
    expect(rotationShiftAt(daily, new Date('2026-10-25T12:00:00Z'))!.startsAt.toISOString()).toBe('2026-10-25T07:00:00.000Z');
    expect(rotationShiftAt(daily, new Date('2026-10-24T12:00:00Z'))!.endsAt.toISOString()).toBe('2026-10-25T07:00:00.000Z');
    expect(resolveOnCall(daily, members, [], new Date('2026-10-25T06:59:00Z')).userId).toBe('ana');
    expect(resolveOnCall(daily, members, [], new Date('2026-10-25T07:00:00Z')).userId).toBe('bojan');
  });

  it('an override wins; an unavailable member leaves nobody; empty rotation leaves nobody', () => {
    const override = { id: 'o1', userId: 'dino', startsAt: new Date('2026-03-03T10:00:00Z'), endsAt: new Date('2026-03-03T18:00:00Z') };
    expect(resolveOnCall(weekly, members, [override], new Date('2026-03-03T12:00:00Z'))).toMatchObject({ userId: 'dino', source: 'override' });
    const withAway = [{ ...members[0]!, isAvailable: false }, members[1]!];
    expect(resolveOnCall(weekly, withAway, [], new Date('2026-03-03T12:00:00Z'))).toMatchObject({ userId: null, source: 'none' });
    expect(resolveOnCall(weekly, [], [], new Date('2026-03-03T12:00:00Z')).userId).toBeNull();
    expect(resolveOnCall({ ...weekly, isActive: false }, members, [override], new Date('2026-03-03T12:00:00Z')).userId).toBeNull();
  });

  it('lists segments cut by overrides', () => {
    const override = { id: 'o1', userId: 'dino', startsAt: new Date('2026-03-10T10:00:00Z'), endsAt: new Date('2026-03-10T18:00:00Z') };
    const segments = listOnCallSegments(weekly, members, [override], new Date('2026-03-01T00:00:00Z'), new Date('2026-03-17T00:00:00Z'));
    expect(segments.map((segment) => [segment.startsAt.toISOString(), segment.userId, segment.source])).toEqual([
      ['2026-03-01T00:00:00.000Z', null, 'none'],
      ['2026-03-02T07:00:00.000Z', 'ana', 'rotation'],
      ['2026-03-09T07:00:00.000Z', 'bojan', 'rotation'],
      ['2026-03-10T10:00:00.000Z', 'dino', 'override'],
      ['2026-03-10T18:00:00.000Z', 'bojan', 'rotation'],
      ['2026-03-16T07:00:00.000Z', 'cazim', 'rotation'],
    ]);
    expect(segments[segments.length - 1]!.endsAt.toISOString()).toBe('2026-03-17T00:00:00.000Z');
  });

  it('detects overlapping overrides', () => {
    const a = { startsAt: new Date('2026-03-10T10:00:00Z'), endsAt: new Date('2026-03-10T18:00:00Z') };
    expect(overridesOverlap({ startsAt: new Date('2026-03-10T17:00:00Z'), endsAt: new Date('2026-03-10T20:00:00Z') }, [a])).toBe(true);
    expect(overridesOverlap({ startsAt: new Date('2026-03-10T18:00:00Z'), endsAt: new Date('2026-03-10T20:00:00Z') }, [a])).toBe(false);
  });
});
