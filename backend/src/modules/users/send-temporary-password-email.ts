import type { SettingsService } from '../settings/settings.service';
import { readEmailAddonEnabled } from '../settings/read-email-addon-enabled';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { isAllowedNotificationEmailAddress } from '../notifications/email/is-allowed-notification-email-address';
import type { MailTransport } from '../notifications/email/mail-transport';
import { renderEmailMessage } from '../notifications/email/render-email-message';
import { resolveEmailLocale } from '../notifications/email/compose-ticket-email';

export async function sendTemporaryPasswordEmail(input: {
  readonly settingsService: SettingsService;
  readonly mailTransport: MailTransport;
  readonly toAddress: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly preferredLocale?: string | null;
}): Promise<boolean> {
  const addonEnabled = await readEmailAddonEnabled(input.settingsService);
  if (!addonEnabled) {
    return false;
  }
  const configuration = await loadEmailChannelConfiguration(
    input.settingsService,
  );
  if (configuration.smtp === null) {
    return false;
  }
  // Restricted delivery applies to account e-mail too: a password must not go
  // to an address outside the policy. Returning false shows it in the UI once.
  if (!isAllowedNotificationEmailAddress(input.toAddress, configuration)) {
    return false;
  }
  const presentation = configuration.presentation;
  const locale = resolveEmailLocale(input.preferredLocale ?? null, configuration);
  const loginUrl = presentation.publicUrl === null ? null : `${presentation.publicUrl}/login`;
  const rendered = renderEmailMessage({
    template: configuration.templates[locale]['user.temporary_password'],
    locale,
    variables: {
      displayName: input.displayName,
      email: input.toAddress,
      temporaryPassword: input.temporaryPassword,
      loginUrl: loginUrl ?? '',
      appName: presentation.appName,
      type: 'user.temporary_password',
      event: 'user.created',
    },
    appName: presentation.appName,
    brand: presentation.brand,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: loginUrl,
    // Account e-mails never invite a reply, whatever the ticket reply mode is.
    replyMode: 'no_reply',
  });
  await input.mailTransport.send(
    {
      from: configuration.smtp.fromAddress,
      to: input.toAddress,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    },
    configuration.smtp,
  );
  return true;
}
