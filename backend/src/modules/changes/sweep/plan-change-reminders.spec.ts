import { planChangeReminder } from './plan-change-reminders';

const now = new Date('2026-10-05T10:00:00Z');
const base = { status: 'SCHEDULED', plannedStart: new Date('2026-10-06T08:00:00Z'), plannedEnd: new Date('2026-10-06T10:00:00Z'), reminderSentAt: null, overdueNotifiedAt: null };

describe('planChangeReminder (3.4)', () => {
  it('reminds once inside the lead window and never after the start', () => {
    expect(planChangeReminder(base, now, 24)).toBe('starting_soon');
    expect(planChangeReminder(base, now, 12)).toBeNull();
    expect(planChangeReminder(base, now, 0)).toBeNull();
    expect(planChangeReminder({ ...base, reminderSentAt: now }, now, 24)).toBeNull();
    expect(planChangeReminder(base, new Date('2026-10-06T09:00:00Z'), 24)).toBeNull();
  });

  it('warns once when the implementation overruns', () => {
    const implementing = { ...base, status: 'IMPLEMENTING' };
    expect(planChangeReminder(implementing, new Date('2026-10-06T10:01:00Z'), 24)).toBe('overdue');
    expect(planChangeReminder(implementing, new Date('2026-10-06T09:59:00Z'), 24)).toBeNull();
    expect(planChangeReminder({ ...implementing, overdueNotifiedAt: now }, new Date('2026-10-06T11:00:00Z'), 24)).toBeNull();
  });
});
