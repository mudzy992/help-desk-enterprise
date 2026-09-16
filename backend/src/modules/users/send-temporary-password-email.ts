import type { SettingsService } from '../settings/settings.service';
import { readEmailAddonEnabled } from '../settings/read-email-addon-enabled';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import type { MailTransport } from '../notifications/email/mail-transport';
import { renderEmailTemplate } from '../notifications/email/render-email-template';

export async function sendTemporaryPasswordEmail(input: {
  readonly settingsService: SettingsService;
  readonly mailTransport: MailTransport;
  readonly toAddress: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
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
  const rendered = renderEmailTemplate(
    configuration.templates['user.temporary_password'],
    {
      displayName: input.displayName,
      email: input.toAddress,
      temporaryPassword: input.temporaryPassword,
      ticketNumber: '',
      ticketTitle: '',
      ticketId: '',
      type: 'user.temporary_password',
      event: 'user.created',
    },
  );
  await input.mailTransport.send(
    {
      from: configuration.smtp.fromAddress,
      to: input.toAddress,
      subject: rendered.subject,
      text: rendered.text,
    },
    configuration.smtp,
  );
  return true;
}
