import { evaluateTicketSlaAtRisk } from './evaluate-ticket-sla-at-risk';

describe('evaluateTicketSlaAtRisk', () => {
  const dueAt = new Date('2026-09-17T10:00:00.000Z');

  it('marks response at risk when remaining time is within the threshold', () => {
    const now = new Date('2026-09-17T09:40:00.000Z');
    const actual = evaluateTicketSlaAtRisk(
      {
        respondedAt: null,
        resolutionCompletedAt: null,
        pausedAt: null,
        responseDueAt: dueAt,
        resolutionDueAt: new Date('2026-09-17T14:00:00.000Z'),
        isResponseBreached: false,
        isResolutionBreached: false,
        isResponseAtRisk: false,
        isResolutionAtRisk: false,
      },
      now,
      30,
    );
    expect(actual.isResponseAtRisk).toBe(true);
    expect(actual.isResolutionAtRisk).toBe(false);
  });

  it('does not mark at risk after breach and clears sticky at-risk', () => {
    const now = new Date('2026-09-17T10:05:00.000Z');
    const actual = evaluateTicketSlaAtRisk(
      {
        respondedAt: null,
        resolutionCompletedAt: null,
        pausedAt: null,
        responseDueAt: dueAt,
        resolutionDueAt: dueAt,
        isResponseBreached: true,
        isResolutionBreached: false,
        isResponseAtRisk: true,
        isResolutionAtRisk: false,
      },
      now,
      30,
    );
    expect(actual.isResponseAtRisk).toBe(false);
  });

  it('keeps at-risk sticky until completion or breach', () => {
    const now = new Date('2026-09-17T09:50:00.000Z');
    const actual = evaluateTicketSlaAtRisk(
      {
        respondedAt: null,
        resolutionCompletedAt: null,
        pausedAt: null,
        responseDueAt: dueAt,
        resolutionDueAt: dueAt,
        isResponseBreached: false,
        isResolutionBreached: false,
        isResponseAtRisk: true,
        isResolutionAtRisk: false,
      },
      now,
      5,
    );
    expect(actual.isResponseAtRisk).toBe(true);
  });
});
