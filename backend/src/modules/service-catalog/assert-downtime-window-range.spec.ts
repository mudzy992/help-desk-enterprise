import { assertDowntimeWindowRange } from './assert-downtime-window-range';
import {
  assertDowntimeWindowsDoNotOverlap,
  downtimeWindowsOverlap,
} from './assert-downtime-windows-do-not-overlap';
import { parseDowntimeInstant } from './parse-downtime-instant';
import { ServiceCatalogError } from './service-catalog.error';

describe('downtime window range validation', () => {
  it('rejects inverted, equal, and invalid instants', () => {
    const start = new Date('2026-09-10T10:00:00.000Z');
    const end = new Date('2026-09-10T11:00:00.000Z');
    expect(() => assertDowntimeWindowRange(start, end)).not.toThrow();
    expect(() => assertDowntimeWindowRange(start, start)).toThrow(
      new ServiceCatalogError('INVALID_DOWNTIME_RANGE'),
    );
    expect(() => assertDowntimeWindowRange(end, start)).toThrow(
      new ServiceCatalogError('INVALID_DOWNTIME_RANGE'),
    );
    expect(() => parseDowntimeInstant('not-a-date')).toThrow(
      new ServiceCatalogError('INVALID_DOWNTIME_RANGE'),
    );
  });

  it('treats adjacent half-open windows as non-overlapping', () => {
    const first = {
      startsAt: new Date('2026-09-10T10:00:00.000Z'),
      endsAt: new Date('2026-09-10T11:00:00.000Z'),
    };
    const second = {
      startsAt: new Date('2026-09-10T11:00:00.000Z'),
      endsAt: new Date('2026-09-10T12:00:00.000Z'),
    };
    expect(downtimeWindowsOverlap(first, second)).toBe(false);
    expect(() =>
      assertDowntimeWindowsDoNotOverlap({
        existingWindows: [first],
        candidate: second,
      }),
    ).not.toThrow();
  });

  it('rejects overlapping windows', () => {
    const existing = {
      startsAt: new Date('2026-09-10T10:00:00.000Z'),
      endsAt: new Date('2026-09-10T12:00:00.000Z'),
    };
    const candidate = {
      startsAt: new Date('2026-09-10T11:00:00.000Z'),
      endsAt: new Date('2026-09-10T13:00:00.000Z'),
    };
    expect(() =>
      assertDowntimeWindowsDoNotOverlap({
        existingWindows: [existing],
        candidate,
      }),
    ).toThrow(new ServiceCatalogError('OVERLAPPING_DOWNTIME_WINDOW'));
  });
});
