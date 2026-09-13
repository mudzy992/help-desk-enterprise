import { settingKeys } from './setting-keys';
import type { SettingValue } from './settings.types';
import { serializeEmailTemplateRegistry } from '../notifications/email/default-email-templates';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import type { SettingsService } from './settings.service';

export type EmailChannelSettingsResponse = {
  readonly smtpEnabled: boolean;
  readonly emailAddonEnabled: boolean;
  readonly channelEnabled: boolean;
  readonly deliveryEnabled: boolean;
  readonly templatesEnabled: boolean;
  readonly internalOnly: boolean;
  readonly allowedExternalDomainsCsv: string;
  readonly allowedExternalEmailsCsv: string;
  readonly templatesJson: string;
  readonly hasSmtpTransport: boolean;
};

export async function readEmailChannelSettings(
  settingsService: SettingsService,
): Promise<EmailChannelSettingsResponse> {
  const configuration = await loadEmailChannelConfiguration(settingsService);
  return {
    smtpEnabled: configuration.smtpEnabled,
    emailAddonEnabled: configuration.emailAddonEnabled,
    channelEnabled: configuration.notificationsEmailEnabled,
    deliveryEnabled: configuration.deliveryEnabled,
    templatesEnabled: configuration.templatesEnabled,
    internalOnly: configuration.internalOnly,
    allowedExternalDomainsCsv: asCsv(
      await settingsService.getSetting(
        settingKeys.privateNotificationsEmailAllowedExternalDomainsCsv,
      ),
    ),
    allowedExternalEmailsCsv: asCsv(
      await settingsService.getSetting(
        settingKeys.privateNotificationsEmailAllowedExternalEmailsCsv,
      ),
    ),
    templatesJson: serializeEmailTemplateRegistry(configuration.templates),
    hasSmtpTransport: configuration.smtp !== null,
  };
}

function asCsv(value: SettingValue | undefined): string {
  return typeof value === 'string' ? value : '';
}
