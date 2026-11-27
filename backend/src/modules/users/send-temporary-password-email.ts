import type { SettingsService } from '../settings/settings.service';
import { readEmailAddonEnabled } from '../settings/read-email-addon-enabled';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { isAllowedNotificationEmailAddress } from '../notifications/email/is-allowed-notification-email-address';
import type { MailTransport } from '../notifications/email/mail-transport';
import { renderEmailMessage } from '../notifications/email/render-email-message';
import { resolveEmailLocale } from '../notifications/email/compose-ticket-email';
import { isReservedNoEmailAddress } from './is-reserved-no-email-address';

/**
 * W2.26 (`BA-users-02`): the delivery channel has to be known **before** the
 * account transaction commits, because the decision changes what the transaction
 * writes: `ui` hands the secret back in the response (so it is hashed and returned
 * in-band), `email` cannot (the plaintext must never be persisted), so the commit
 * only records a durable delivery intent and the credential is issued by the
 * delivery worker.
 *
 * The predicate is exactly the one `sendTemporaryPasswordEmail` applies, minus the
 * send: e-mail add-on on, SMTP configured, address allowed by policy and not a
 * reserved no-mail domain.
 */
export async function resolveTemporaryPasswordChannel(input: {
  readonly settingsService: SettingsService;
  readonly email: string;
}): Promise<'email' | 'ui'> {
  if (isReservedNoEmailAddress(input.email)) return 'ui';
  const addonEnabled = await readEmailAddonEnabled(input.settingsService);
  if (!addonEnabled) return 'ui';
  const configuration = await loadEmailChannelConfiguration(input.settingsService);
  if (configuration.smtp === null) return 'ui';
  if (!isAllowedNotificationEmailAddress(input.email, configuration)) return 'ui';
  return 'email';
}

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
