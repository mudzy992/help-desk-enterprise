import { parseWaitingForUserConfiguration } from './parse-waiting-for-user-configuration';

describe('parseWaitingForUserConfiguration', () => {
  it('disables automation when the flag is off', () => {
    expect(
      parseWaitingForUserConfiguration({
        enabled: false,
        reminderAfterDays: 2,
        autoCloseAfterDays: 7,
      }).enabled,
    ).toBe(false);
  });

  it('parses enabled reminder and auto-close windows', () => {
    expect(
      parseWaitingForUserConfiguration({
        enabled: true,
        reminderAfterDays: 3,
        autoCloseAfterDays: 10,
      }),
    ).toEqual({
      enabled: true,
      reminderAfterDays: 3,
      autoCloseAfterDays: 10,
    });
  });

  it('rejects missing or invalid day values', () => {
    expect(() =>
      parseWaitingForUserConfiguration({
        enabled: true,
        reminderAfterDays: 0,
        autoCloseAfterDays: 7,
      }),
    ).toThrow('WAITING_FOR_USER_UNAVAILABLE');
    expect(() =>
      parseWaitingForUserConfiguration({
        enabled: 'yes',
        reminderAfterDays: 2,
        autoCloseAfterDays: 7,
      }),
    ).toThrow('WAITING_FOR_USER_UNAVAILABLE');
  });
});
