import { resolveEmailAddonEnabled } from './resolve-email-addon-enabled';

describe('resolveEmailAddonEnabled', () => {
  it('returns false when SMTP is off even if the email addon is stored on', () => {
    expect(
      resolveEmailAddonEnabled({
        smtpEnabled: false,
        emailAddonEnabled: true,
      }),
    ).toBe(false);
  });

  it('returns true only when SMTP and the email addon are both on', () => {
    expect(
      resolveEmailAddonEnabled({
        smtpEnabled: true,
        emailAddonEnabled: true,
      }),
    ).toBe(true);
    expect(
      resolveEmailAddonEnabled({
        smtpEnabled: true,
        emailAddonEnabled: false,
      }),
    ).toBe(false);
  });
});
