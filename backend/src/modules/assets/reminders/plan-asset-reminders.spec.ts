import { localHour, planAssetReminders } from './plan-asset-reminders';

const now = new Date('2026-09-30T08:00:00Z');
const at = (days: number) => new Date(Date.UTC(2026, 8, 30 + days));

describe('planAssetReminders (paket 3.2 §10)', () => {
  it('sends once per crossed threshold and records every crossed one', () => {
    expect(planAssetReminders([{ id: 'a', endsAt: at(45), remindersSent: [] }], [60, 30, 7], now)).toEqual([
      { id: 'a', daysLeft: 45, threshold: 60, remindersSent: [60] },
    ]);
    expect(planAssetReminders([{ id: 'a', endsAt: at(45), remindersSent: [60] }], [60, 30, 7], now)).toEqual([]);
  });

  it('collapses several missed thresholds into one reminder', () => {
    expect(planAssetReminders([{ id: 'b', endsAt: at(5), remindersSent: [] }], [60, 30, 7], now)).toEqual([
      { id: 'b', daysLeft: 5, threshold: 7, remindersSent: [60, 30, 7] },
    ]);
  });

  it('ignores expired items, items beyond the window and empty thresholds', () => {
    const candidates = [
      { id: 'old', endsAt: at(-1), remindersSent: [] },
      { id: 'far', endsAt: at(90), remindersSent: [] },
    ];
    expect(planAssetReminders(candidates, [60, 30, 7], now)).toEqual([]);
    expect(planAssetReminders([{ id: 'x', endsAt: at(1), remindersSent: [] }], [], now)).toEqual([]);
  });

  it('includes the expiry day itself', () => {
    expect(planAssetReminders([{ id: 'today', endsAt: at(0), remindersSent: [60, 30] }], [60, 30, 7], now)[0]).toMatchObject({
      daysLeft: 0,
      threshold: 7,
    });
  });

  it('reads the local hour of the installation time zone', () => {
    expect(localHour(new Date('2026-09-30T04:30:00Z'), 'Europe/Sarajevo')).toBe(6);
    expect(localHour(new Date('2026-09-30T04:30:00Z'), 'Not/AZone')).toBe(4);
  });
});
