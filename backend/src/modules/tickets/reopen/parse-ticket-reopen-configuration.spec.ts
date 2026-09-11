import { parseTicketReopenConfiguration } from './parse-ticket-reopen-configuration';

describe('parseTicketReopenConfiguration', () => {
  it('disables reopen when the flag is off', () => {
    expect(
      parseTicketReopenConfiguration({
        enabled: false,
        windowDays: 7,
      }),
    ).toEqual({ enabled: false, windowDays: 7 });
  });

  it('parses the reopen window', () => {
    expect(
      parseTicketReopenConfiguration({
        enabled: true,
        windowDays: 10,
      }),
    ).toEqual({ enabled: true, windowDays: 10 });
  });

  it('rejects invalid flags and windows', () => {
    expect(() =>
      parseTicketReopenConfiguration({ enabled: true, windowDays: 0 }),
    ).toThrow('REOPEN_UNAVAILABLE');
    expect(() =>
      parseTicketReopenConfiguration({ enabled: 'yes', windowDays: 7 }),
    ).toThrow('REOPEN_UNAVAILABLE');
  });
});
