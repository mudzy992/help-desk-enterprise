import { computeDueAt, computeExtendedDueAt, daysLeft, dueReminderRung, effectiveDueAt } from './request-deadlines';

const day = 86_400_000;
const received = new Date('2026-10-01T09:00:00.000Z');

describe('request deadlines (ZZLP čl. 14(3))', () => {
  it('answers within 30 days of receipt', () => {
    expect(computeDueAt(received).toISOString()).toBe('2026-10-31T09:00:00.000Z');
  });

  it('extends once by 60 days, only before the original deadline', () => {
    const dueAt = computeDueAt(received);
    const extended = computeExtendedDueAt({ dueAt, extendedDueAt: null, now: new Date(dueAt.getTime() - day) });
    expect(extended?.toISOString()).toBe('2026-12-30T09:00:00.000Z');
    expect(computeExtendedDueAt({ dueAt, extendedDueAt: extended, now: received })).toBeNull();
    expect(computeExtendedDueAt({ dueAt, extendedDueAt: null, now: new Date(dueAt.getTime() + 1) })).toBeNull();
    expect(effectiveDueAt({ dueAt, extendedDueAt: extended })).toBe(extended);
    expect(effectiveDueAt({ dueAt, extendedDueAt: null })).toBe(dueAt);
  });

  it('counts whole days left, negative when overdue', () => {
    const dueAt = computeDueAt(received);
    expect(daysLeft(dueAt, new Date(dueAt.getTime() - 6.5 * day))).toBe(7);
    expect(daysLeft(dueAt, dueAt)).toBe(0);
    expect(daysLeft(dueAt, new Date(dueAt.getTime() + 1.5 * day))).toBe(-1);
  });

  it('sends each reminder rung once and only the closest when several are due', () => {
    const dueAt = computeDueAt(received);
    const ladder = [7, 1];
    expect(dueReminderRung({ dueAt, now: new Date(dueAt.getTime() - 10 * day), ladder, sent: [] })).toBeNull();
    expect(dueReminderRung({ dueAt, now: new Date(dueAt.getTime() - 7 * day), ladder, sent: [] })).toBe(7);
    expect(dueReminderRung({ dueAt, now: new Date(dueAt.getTime() - 5 * day), ladder, sent: [7] })).toBeNull();
    expect(dueReminderRung({ dueAt, now: new Date(dueAt.getTime() - 0.5 * day), ladder, sent: [] })).toBe(1);
    expect(dueReminderRung({ dueAt, now: new Date(dueAt.getTime() + day), ladder, sent: [7, 1] })).toBeNull();
  });
});
