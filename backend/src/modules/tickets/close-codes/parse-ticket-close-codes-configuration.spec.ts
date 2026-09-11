import { parseTicketCloseCodesConfiguration } from './parse-ticket-close-codes-configuration';

describe('parseTicketCloseCodesConfiguration', () => {
  it('parses the allow-list and require-on-resolve flag', () => {
    expect(
      parseTicketCloseCodesConfiguration({
        enabled: true,
        allowedCodesCsv: 'bug_fixed,other',
        requireOnResolve: true,
      }),
    ).toEqual({
      enabled: true,
      allowedCodes: ['bug_fixed', 'other'],
      requireOnResolve: true,
    });
  });

  it('keeps defaults when close codes are disabled', () => {
    const parsed = parseTicketCloseCodesConfiguration({
      enabled: false,
      allowedCodesCsv: '',
      requireOnResolve: false,
    });
    expect(parsed.enabled).toBe(false);
    expect(parsed.allowedCodes.length).toBeGreaterThan(0);
  });

  it('rejects an empty allow-list', () => {
    expect(() =>
      parseTicketCloseCodesConfiguration({
        enabled: true,
        allowedCodesCsv: '  ',
        requireOnResolve: true,
      }),
    ).toThrow('CLOSE_CODES_UNAVAILABLE');
  });
});
