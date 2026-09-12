import { isTicketSlaOverdue } from './is-ticket-sla-overdue';

describe('isTicketSlaOverdue', () => {
  it('uses persisted response and resolution breach flags', () => {
    expect(isTicketSlaOverdue(undefined)).toBe(false);
    expect(isTicketSlaOverdue(null)).toBe(false);
    expect(
      isTicketSlaOverdue({
        isResponseBreached: false,
        isResolutionBreached: false,
      }),
    ).toBe(false);
    expect(
      isTicketSlaOverdue({
        isResponseBreached: true,
        isResolutionBreached: false,
      }),
    ).toBe(true);
    expect(
      isTicketSlaOverdue({
        isResponseBreached: false,
        isResolutionBreached: true,
      }),
    ).toBe(true);
  });
});
