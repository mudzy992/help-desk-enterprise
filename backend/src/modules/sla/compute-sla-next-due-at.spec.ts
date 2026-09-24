import { computeSlaNextDueAt } from './compute-sla-next-due-at';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import type { SlaConfiguration } from './sla.types';
import type { TicketSlaStateRecord } from './ticket-sla.types';
const tuesdayMorning = new Date('2026-09-15T08:00:00.000Z');

const configuration: SlaConfiguration = {
  enabled: true,
  allowServiceOverrides: false,
  allowOuOverrides: false,
  pauseOnWaitingForUser: false,
  pauseOnPendingApproval: false,
  notifyBeforeOverdueMinutes: 30,
  escalationsEnabled: true,
  maxEscalationLevels: 3,
};

const calendar: BusinessMinutesCalendar = {
  timezone: 'UTC',
  // 2026-09-15 is a Tuesday, the only open day of this fixture calendar.
  weeklyHours: {
    '2': [{ start: '08:00', end: '16:00' }],
  },
  holidays: [],
};

function state(
  overrides: Partial<TicketSlaStateRecord> = {},
): TicketSlaStateRecord {
  return {
    id: 'sla-1',
    ticketId: 'ticket-1',
    slaProfileId: 'profile-1',
    slaRuleId: 'rule-1',
    responseMinutes: 60,
    resolutionMinutes: 480,
    startedAt: tuesdayMorning,
    responseDueAt: new Date('2026-09-15T09:00:00.000Z'),
    resolutionDueAt: new Date('2026-09-15T16:00:00.000Z'),
    respondedAt: null,
    resolutionCompletedAt: null,
    pausedAt: null,
    pausedBusinessMinutes: 0,
    isResponseBreached: false,
    isResolutionBreached: false,
    isResponseAtRisk: false,
    isResolutionAtRisk: false,
    firedEscalationKeys: [],
    nextDueAt: null,
    updatedAt: tuesdayMorning,
    ...overrides,
  };
}

const noRules: readonly never[] = [];

describe('computeSlaNextDueAt', () => {
  it('schedules the at-risk mark while the clock still looks healthy', () => {
    const next = computeSlaNextDueAt({
      state: state(),
      rules: noRules,
      calendar,
      configuration,
    });
    // 09:00 due minus 30 minutes of warning.
    expect(next?.toISOString()).toBe('2026-09-15T08:30:00.000Z');
  });

  it('moves on to the breach instant once the warning was already given', () => {
    const next = computeSlaNextDueAt({
      state: state({ isResponseAtRisk: true }),
      rules: noRules,
      calendar,
      configuration,
    });
    expect(next?.toISOString()).toBe('2026-09-15T09:00:00.001Z');
  });

  it('keeps a breached clock until its escalation offsets elapse', () => {
    const next = computeSlaNextDueAt({
      state: state({ isResponseBreached: true, respondedAt: null }),
      rules: [
        {
          id: 'escalate-late',
          slaProfileId: 'profile-1',
          triggerOffsetMinutes: 120,
          targetGroupId: null,
          targetRole: null,
          targetUserId: null,
        },
      ],
      calendar,
      configuration,
    });
    // 09:00 + 120 business minutes (UTC calendar 08:00–16:00) = 11:00.
    expect(next?.toISOString()).toBe('2026-09-15T11:00:00.001Z');
  });

  it('schedules a fired-immediately escalation at the breach instant', () => {
    const next = computeSlaNextDueAt({
      state: state({
        respondedAt: new Date('2026-09-15T08:30:00.000Z'),
        isResolutionBreached: true,
      }),
      rules: [
        {
          id: 'escalate-late',
          slaProfileId: 'profile-1',
          triggerOffsetMinutes: 120,
          targetGroupId: null,
          targetRole: null,
          targetUserId: null,
        },
        {
          id: 'escalate-now',
          slaProfileId: 'profile-1',
          triggerOffsetMinutes: 0,
          targetGroupId: null,
          targetRole: null,
          targetUserId: null,
        },
      ],
      calendar,
      configuration,
    });
    // The offset-0 rule is due the moment the clock passed the due instant, so
    // it wins over the +120 minute rule.
    expect(next?.toISOString()).toBe('2026-09-15T16:00:00.000Z');
  });

  it('forgets an escalation that already fired', () => {
    const next = computeSlaNextDueAt({
      state: state({
        isResponseBreached: true,
        firedEscalationKeys: ['response:escalate-now'],
      }),
      rules: [
        {
          id: 'escalate-now',
          slaProfileId: 'profile-1',
          triggerOffsetMinutes: 0,
          targetGroupId: null,
          targetRole: null,
          targetUserId: null,
        },
      ],
      calendar,
      configuration,
    });
    // Only the resolution clock is left: resolution due 16:00 minus 30 minutes.
    expect(next?.toISOString()).toBe('2026-09-15T15:30:00.000Z');
  });

  it('settles a clock that was answered in time', () => {
    const next = computeSlaNextDueAt({
      state: state({ respondedAt: new Date('2026-09-15T08:30:00.000Z') }),
      rules: noRules,
      calendar,
      configuration,
    });
    expect(next?.toISOString()).toBe('2026-09-15T15:30:00.000Z');
  });

  it('returns null when nothing time-driven can happen', () => {
    expect(
      computeSlaNextDueAt({
        state: state({
          respondedAt: new Date('2026-09-15T08:30:00.000Z'),
          resolutionCompletedAt: new Date('2026-09-15T09:30:00.000Z'),
        }),
        rules: noRules,
        calendar,
        configuration,
      }),
    ).toBeNull();
    expect(
      computeSlaNextDueAt({
        state: state({ pausedAt: tuesdayMorning }),
        rules: noRules,
        calendar,
        configuration,
      }),
    ).toBeNull();
    expect(
      computeSlaNextDueAt({
        state: state(),
        rules: noRules,
        calendar,
        configuration: { ...configuration, enabled: false },
      }),
    ).toBeNull();
  });

  it('never schedules an escalation it could not compute', () => {
    const next = computeSlaNextDueAt({
      state: state({ isResponseBreached: true }),
      rules: [
        {
          id: 'escalate-late',
          slaProfileId: 'profile-1',
          triggerOffsetMinutes: 120,
          targetGroupId: null,
          targetRole: null,
          targetUserId: null,
        },
      ],
      calendar: null,
      configuration,
    });
    // No calendar: the offset can never elapse, so only the resolution clock is
    // scheduled — and it must not throw while the state is being persisted.
    expect(next?.toISOString()).toBe('2026-09-15T15:30:00.000Z');
  });

  it('ignores the escalation rules while escalations are off', () => {
    const next = computeSlaNextDueAt({
      state: state({ isResponseBreached: true }),
      rules: [
        {
          id: 'escalate-late',
          slaProfileId: 'profile-1',
          triggerOffsetMinutes: 120,
          targetGroupId: null,
          targetRole: null,
          targetUserId: null,
        },
      ],
      calendar,
      configuration: { ...configuration, escalationsEnabled: false },
    });
    expect(next?.toISOString()).toBe('2026-09-15T15:30:00.000Z');
  });
});
