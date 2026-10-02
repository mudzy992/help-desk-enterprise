import { isAllowedNotificationEmailAddress } from './is-allowed-notification-email-address';

const restricted = {
  internalOnly: true,
  internalDomains: ['example.com', 'ep-grupa.ba'],
  allowedExternalDomains: ['partner.example'],
  allowedExternalEmails: ['guest@external.test'],
};

describe('isAllowedNotificationEmailAddress', () => {
  it('restricted: allows every configured internal domain, case-insensitively', () => {
    expect(isAllowedNotificationEmailAddress('Agent.IT@EPBIH.BA', restricted)).toBe(true);
    expect(isAllowedNotificationEmailAddress('ops@ep-grupa.ba', restricted)).toBe(true);
  });

  it('restricted: also allows the extra domains and individual addresses', () => {
    expect(isAllowedNotificationEmailAddress('user@partner.example', restricted)).toBe(true);
    expect(isAllowedNotificationEmailAddress('guest@external.test', restricted)).toBe(true);
  });

  it('restricted: blocks everything else, including subdomains and look-alikes', () => {
    expect(isAllowedNotificationEmailAddress('other@gmail.com', restricted)).toBe(false);
    expect(isAllowedNotificationEmailAddress('other@external.test', restricted)).toBe(false);
    expect(isAllowedNotificationEmailAddress('x@mail.example.com', restricted)).toBe(false);
    expect(isAllowedNotificationEmailAddress('x@example.com.evil.test', restricted)).toBe(false);
  });

  it('restricted with no domains and no lists: nobody (nothing is hardcoded)', () => {
    const empty = { internalOnly: true, internalDomains: [], allowedExternalDomains: [], allowedExternalEmails: [] };
    expect(isAllowedNotificationEmailAddress('agent@example.com', empty)).toBe(false);
  });

  it('unrestricted: any valid address, even with empty lists', () => {
    const open = { internalOnly: false, internalDomains: [], allowedExternalDomains: [], allowedExternalEmails: [] };
    expect(isAllowedNotificationEmailAddress('other@gmail.com', open)).toBe(true);
    expect(isAllowedNotificationEmailAddress('agent@example.com', open)).toBe(true);
  });

  it('rejects malformed addresses in both modes', () => {
    const open = { ...restricted, internalOnly: false };
    for (const policy of [restricted, open]) {
      expect(isAllowedNotificationEmailAddress('', policy)).toBe(false);
      expect(isAllowedNotificationEmailAddress('not-an-email', policy)).toBe(false);
      expect(isAllowedNotificationEmailAddress('a@nodot', policy)).toBe(false);
    }
  });
});
