import { standardWeeklyHours } from '../../sla/sla.constants';
import { planProblemReminder } from './plan-problem-reminders';

const calendar = { timezone: 'Europe/Sarajevo', weeklyHours: standardWeeklyHours, holidays: [] };
// 2026-10-07 is a Wednesday; target at 16:00 local (14:00 UTC).
const targetAt = new Date('2026-10-07T14:00:00Z');
const at = (iso: string) => new Date(iso);

describe('planProblemReminder', () => {
  it('sends "before" on the previous working day', () => {
    expect(planProblemReminder(calendar, { targetAt, remindersSent: [] }, at('2026-10-06T06:00:00Z'))).toBe('before');
  });
  it('sends "due" on the target day and never twice', () => {
    expect(planProblemReminder(calendar, { targetAt, remindersSent: ['before'] }, at('2026-10-07T06:00:00Z'))).toBe('due');
    expect(planProblemReminder(calendar, { targetAt, remindersSent: ['before', 'due'] }, at('2026-10-07T15:00:00Z'))).toBeNull();
  });
  it('sends "overdue" once on a later working day', () => {
    expect(planProblemReminder(calendar, { targetAt, remindersSent: ['due'] }, at('2026-10-08T06:00:00Z'))).toBe('overdue');
    expect(planProblemReminder(calendar, { targetAt, remindersSent: ['due', 'overdue'] }, at('2026-10-09T06:00:00Z'))).toBeNull();
  });
  it('stays silent on weekends', () => {
    expect(planProblemReminder(calendar, { targetAt, remindersSent: ['due'] }, at('2026-10-10T06:00:00Z'))).toBeNull();
  });
  it('a Monday target is announced on Friday', () => {
    const monday = new Date('2026-10-12T14:00:00Z');
    expect(planProblemReminder(calendar, { targetAt: monday, remindersSent: [] }, at('2026-10-09T06:00:00Z'))).toBe('before');
  });
});
