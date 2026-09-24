import {
  civilDayKey,
  offsetMillisecondsAt,
  startOfCivilDay,
} from './start-of-civil-day';

/**
 * Every expectation below is an absolute UTC instant, so the suite gives the
 * same answer on a machine in Sarajevo, in UTC or in New York — which is the
 * whole point of the helper (the process zone must not decide the boundary).
 */
const utc = (iso: string): Date => new Date(iso);

describe('startOfCivilDay', () => {
  it('uses the zone offset, not the process zone (Europe/Sarajevo, summer)', () => {
    expect(
      startOfCivilDay(utc('2026-09-24T10:00:00.000Z'), 'Europe/Sarajevo'),
    ).toEqual(utc('2026-09-23T22:00:00.000Z'));
  });

  it('uses the winter offset of the same zone', () => {
    expect(
      startOfCivilDay(utc('2026-01-15T10:00:00.000Z'), 'Europe/Sarajevo'),
    ).toEqual(utc('2026-01-14T23:00:00.000Z'));
  });

  it('is UTC midnight for a zone without an offset', () => {
    expect(startOfCivilDay(utc('2026-09-24T10:00:00.000Z'), 'UTC')).toEqual(
      utc('2026-09-24T00:00:00.000Z'),
    );
  });

  it('moves forward for a zone west of Greenwich', () => {
    // 02:00 UTC is still 22:00 of the previous day in New York.
    expect(
      startOfCivilDay(utc('2026-09-24T02:00:00.000Z'), 'America/New_York'),
    ).toEqual(utc('2026-09-23T04:00:00.000Z'));
    expect(
      startOfCivilDay(utc('2026-09-24T10:00:00.000Z'), 'America/New_York'),
    ).toEqual(utc('2026-09-24T04:00:00.000Z'));
  });

  it('handles half-hour offsets', () => {
    expect(
      startOfCivilDay(utc('2026-09-24T10:00:00.000Z'), 'Asia/Kolkata'),
    ).toEqual(utc('2026-09-23T18:30:00.000Z'));
  });

  it('handles the far-east offset', () => {
    expect(
      startOfCivilDay(utc('2026-09-23T20:00:00.000Z'), 'Pacific/Kiritimati'),
    ).toEqual(utc('2026-09-23T10:00:00.000Z'));
  });

  it('starts exactly at local midnight, not a second early', () => {
    const midnight = utc('2026-09-23T22:00:00.000Z');
    expect(startOfCivilDay(midnight, 'Europe/Sarajevo')).toEqual(midnight);
    expect(
      startOfCivilDay(new Date(midnight.getTime() - 1), 'Europe/Sarajevo'),
    ).toEqual(utc('2026-09-22T22:00:00.000Z'));
    expect(
      startOfCivilDay(new Date(midnight.getTime() + 1), 'Europe/Sarajevo'),
    ).toEqual(midnight);
  });

  it('lands on the right day when the offset changes that day (spring forward)', () => {
    // 2026-03-29: CEST starts at 02:00 local, i.e. 01:00 UTC. The day begins
    // while CET is still in effect, so the boundary is 23:00 UTC the day before.
    expect(
      startOfCivilDay(utc('2026-03-29T12:00:00.000Z'), 'Europe/Sarajevo'),
    ).toEqual(utc('2026-03-28T23:00:00.000Z'));
    expect(civilDayKey(utc('2026-03-29T12:00:00.000Z'), 'Europe/Sarajevo')).toBe(
      '2026-03-29',
    );
  });

  it('lands on the right day when the offset changes that day (fall back)', () => {
    // 2026-10-25: CET returns at 03:00 local (01:00 UTC); midnight was still CEST.
    expect(
      startOfCivilDay(utc('2026-10-25T12:00:00.000Z'), 'Europe/Sarajevo'),
    ).toEqual(utc('2026-10-24T22:00:00.000Z'));
  });

  it('is at or before the instant, and never more than a day before', () => {
    const instants = [
      '2026-01-01T00:00:00.000Z',
      '2026-03-29T00:30:00.000Z',
      '2026-06-30T23:59:59.999Z',
      '2026-10-24T22:00:00.000Z',
      '2026-12-31T23:59:59.000Z',
    ];
    const zones = [
      'UTC',
      'Europe/Sarajevo',
      'America/New_York',
      'Asia/Kolkata',
      'Pacific/Kiritimati',
      'Pacific/Pago_Pago',
    ];
    for (const instant of instants) {
      for (const zone of zones) {
        const now = utc(instant);
        const start = startOfCivilDay(now, zone);
        expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(now.getTime() - start.getTime()).toBeLessThan(25 * 60 * 60 * 1000);
        expect(civilDayKey(start, zone)).toBe(civilDayKey(now, zone));
      }
    }
  });
});

describe('offsetMillisecondsAt', () => {
  it('reports the summer and winter offsets of a zone', () => {
    expect(
      offsetMillisecondsAt(utc('2026-09-24T10:00:00.000Z'), 'Europe/Sarajevo'),
    ).toBe(2 * 60 * 60 * 1000);
    expect(
      offsetMillisecondsAt(utc('2026-01-15T10:00:00.000Z'), 'Europe/Sarajevo'),
    ).toBe(1 * 60 * 60 * 1000);
    expect(offsetMillisecondsAt(utc('2026-09-24T10:00:00.000Z'), 'UTC')).toBe(0);
    expect(
      offsetMillisecondsAt(utc('2026-09-24T10:00:00.000Z'), 'America/New_York'),
    ).toBe(-4 * 60 * 60 * 1000);
  });

  it('ignores the sub-second part of the instant', () => {
    expect(
      offsetMillisecondsAt(utc('2026-09-24T10:00:00.750Z'), 'Europe/Sarajevo'),
    ).toBe(2 * 60 * 60 * 1000);
  });
});

describe('civilDayKey', () => {
  it('rolls over at the zone midnight, not at the process midnight', () => {
    expect(civilDayKey(utc('2026-09-23T21:59:59.999Z'), 'Europe/Sarajevo')).toBe(
      '2026-09-23',
    );
    expect(civilDayKey(utc('2026-09-23T22:00:00.000Z'), 'Europe/Sarajevo')).toBe(
      '2026-09-24',
    );
    expect(civilDayKey(utc('2026-09-23T22:00:00.000Z'), 'UTC')).toBe('2026-09-23');
  });
});
