import { applyRecomputedSlaRule } from './recompute-ticket-sla-targets';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import type { TicketSlaStateRecord } from './ticket-sla.types';

jest.mock('./add-business-minutes', () => ({
  // 24/7 calendar for the test: business minute = wall-clock minute.
  addBusinessMinutes: (_calendar: unknown, from: Date, minutes: number) =>
    new Date(from.getTime() + minutes * 60_000),
}));

const start = new Date('2026-09-01T08:00:00.000Z');
const state: TicketSlaStateRecord = {
  id: 's',
  ticketId: 't',
  slaProfileId: 'p',
  slaRuleId: 'low',
  responseMinutes: 480,
  resolutionMinutes: 2400,
  startedAt: start,
  responseDueAt: new Date(start.getTime() + 480 * 60_000),
  resolutionDueAt: new Date(start.getTime() + 2400 * 60_000),
  respondedAt: null,
  resolutionCompletedAt: null,
  pausedAt: null,
  pausedBusinessMinutes: 30,
  isResponseBreached: true,
  isResolutionBreached: false,
  isResponseAtRisk: true,
  isResolutionAtRisk: false,
  firedEscalationKeys: ['x'],
  nextDueAt: null,
  updatedAt: start,
};
const calendar = {} as BusinessMinutesCalendar;
const critical = { id: 'crit', responseMinutes: 15, resolutionMinutes: 240 };

describe('applyRecomputedSlaRule (package 1.2)', () => {
  it('measures the new targets from the original start plus accumulated pause', () => {
    const next = applyRecomputedSlaRule(state, critical, calendar);
    expect(next.slaRuleId).toBe('crit');
    expect(next.responseDueAt?.toISOString()).toBe('2026-09-01T08:45:00.000Z');
    expect(next.resolutionDueAt?.toISOString()).toBe('2026-09-01T12:30:00.000Z');
  });

  it('keeps a recorded breach and fired escalations', () => {
    const next = applyRecomputedSlaRule(state, critical, calendar);
    expect(next.isResponseBreached).toBe(true);
    expect(next.firedEscalationKeys).toEqual(['x']);
  });

  it('keeps a met response target and moves only the resolution target', () => {
    const responded = { ...state, respondedAt: new Date('2026-09-01T09:00:00.000Z') };
    const next = applyRecomputedSlaRule(responded, critical, calendar);
    expect(next.responseDueAt).toEqual(state.responseDueAt);
    expect(next.responseMinutes).toBe(480);
    expect(next.resolutionMinutes).toBe(240);
  });
});
