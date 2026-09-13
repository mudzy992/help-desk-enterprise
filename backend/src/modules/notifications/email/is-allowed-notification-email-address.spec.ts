import {
  isAllowedNotificationEmailAddress,
  isInternalNotificationEmailAddress,
} from './is-allowed-notification-email-address';

const internalPolicy = {
  internalOnly: true,
  allowedExternalDomains: ['partner.example'],
  allowedExternalEmails: ['guest@external.test'],
};

describe('isAllowedNotificationEmailAddress', () => {
  it('allows internal @epbih.ba addresses', () => {
    expect(isInternalNotificationEmailAddress('Agent.IT@EPBIH.BA')).toBe(true);
    expect(
      isAllowedNotificationEmailAddress('agent.it@epbih.ba', internalPolicy),
    ).toBe(true);
  });

  it('blocks external addresses while internal-only is on', () => {
    expect(
      isAllowedNotificationEmailAddress('guest@external.test', internalPolicy),
    ).toBe(false);
    expect(
      isAllowedNotificationEmailAddress('user@partner.example', internalPolicy),
    ).toBe(false);
  });

  it('allows listed external recipients only when internal-only is off', () => {
    const open = { ...internalPolicy, internalOnly: false };
    expect(isAllowedNotificationEmailAddress('guest@external.test', open)).toBe(
      true,
    );
    expect(isAllowedNotificationEmailAddress('user@partner.example', open)).toBe(
      true,
    );
    expect(isAllowedNotificationEmailAddress('other@gmail.com', open)).toBe(
      false,
    );
  });

  it('rejects malformed addresses', () => {
    expect(isAllowedNotificationEmailAddress('', internalPolicy)).toBe(false);
    expect(isAllowedNotificationEmailAddress('not-an-email', internalPolicy)).toBe(
      false,
    );
  });
});
