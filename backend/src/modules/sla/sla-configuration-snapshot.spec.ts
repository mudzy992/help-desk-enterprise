import { createSlaConfigurationSnapshot, parseSlaConfigurationCalendar } from './sla-configuration-snapshot';

const rule = { id: 'rule-1', responseMinutes: 30, resolutionMinutes: 240 };
const calendar = {
  timezone: 'Europe/Sarajevo',
  weeklyHours: { '1': [{ start: '08:00', end: '16:00' }] },
  holidays: [{ date: '2027-01-01' }],
};

describe('SLA configuration snapshot', () => {
  it('produces a deterministic immutable version and revives its calendar', () => {
    const first = createSlaConfigurationSnapshot(rule, calendar);
    const second = createSlaConfigurationSnapshot(rule, {
      holidays: [{ date: '2027-01-01' }],
      weeklyHours: { '1': [{ start: '08:00', end: '16:00' }] },
      timezone: 'Europe/Sarajevo',
    });
    expect(first.version).toHaveLength(64);
    expect(second.version).toBe(first.version);
    expect(parseSlaConfigurationCalendar(first.snapshot as never)).toEqual(calendar);
  });

  it('changes version whenever an effective target or calendar changes', () => {
    const baseline = createSlaConfigurationSnapshot(rule, calendar).version;
    expect(createSlaConfigurationSnapshot({ ...rule, resolutionMinutes: 300 }, calendar).version).not.toBe(baseline);
    expect(createSlaConfigurationSnapshot(rule, { ...calendar, timezone: 'UTC' }).version).not.toBe(baseline);
  });
});
