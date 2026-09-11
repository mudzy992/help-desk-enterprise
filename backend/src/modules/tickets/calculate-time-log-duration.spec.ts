import { calculateTimeLogDurationSeconds } from './calculate-time-log-duration';

describe('calculateTimeLogDurationSeconds', () => {
  it('uses server timestamps and never goes negative', () => {
    const startedAt = new Date('2026-09-11T12:00:00.000Z');
    const endedAt = new Date('2026-09-11T12:00:01.500Z');
    expect(calculateTimeLogDurationSeconds(startedAt, endedAt)).toBe(1);
    expect(calculateTimeLogDurationSeconds(endedAt, startedAt)).toBe(0);
  });
});
