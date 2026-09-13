import { resolveEmailChannelEnabled } from './resolve-email-channel-enabled';

describe('resolveEmailChannelEnabled', () => {
  it('requires SMTP, the email addon, and the notification channel flag', () => {
    expect(
      resolveEmailChannelEnabled({
        smtpEnabled: true,
        emailAddonEnabled: true,
        notificationsEmailEnabled: true,
      }),
    ).toBe(true);
    expect(
      resolveEmailChannelEnabled({
        smtpEnabled: false,
        emailAddonEnabled: true,
        notificationsEmailEnabled: true,
      }),
    ).toBe(false);
    expect(
      resolveEmailChannelEnabled({
        smtpEnabled: true,
        emailAddonEnabled: false,
        notificationsEmailEnabled: true,
      }),
    ).toBe(false);
    expect(
      resolveEmailChannelEnabled({
        smtpEnabled: true,
        emailAddonEnabled: true,
        notificationsEmailEnabled: false,
      }),
    ).toBe(false);
  });
});
