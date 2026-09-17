import { isTicketSlaAtRisk } from './is-ticket-sla-at-risk';

describe('isTicketSlaAtRisk', () => {
  it('uses persisted at-risk flags and defers to breach', () => {
    expect(isTicketSlaAtRisk(undefined)).toBe(false);
    expect(isTicketSlaAtRisk(null)).toBe(false);
    expect(
      isTicketSlaAtRisk({
        isResponseAtRisk: false,
        isResolutionAtRisk: false,
      }),
    ).toBe(false);
    expect(
      isTicketSlaAtRisk({
        isResponseAtRisk: true,
        isResolutionAtRisk: false,
      }),
    ).toBe(true);
    expect(
      isTicketSlaAtRisk({
        isResponseAtRisk: true,
        isResolutionAtRisk: false,
        isResponseBreached: true,
        isResolutionBreached: false,
      }),
    ).toBe(false);
  });
});
