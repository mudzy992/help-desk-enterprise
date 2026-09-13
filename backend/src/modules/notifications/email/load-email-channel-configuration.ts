import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { defaultEmailTemplates } from './default-email-templates';
import { parseEmailTemplateRegistry } from './parse-email-template-registry';
import { parseSettingsCsv } from './parse-settings-csv';
import { resolveEmailChannelEnabled } from './resolve-email-channel-enabled';
import type { EmailTemplateRegistry } from './email-template.types';

export type SmtpTransportConfig = {
  readonly host: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username: string;
  readonly password: string;
  readonly fromAddress: string;
};

export type EmailChannelConfiguration = {
  readonly deliveryEnabled: boolean;
  readonly smtpEnabled: boolean;
  readonly emailAddonEnabled: boolean;
  readonly notificationsEmailEnabled: boolean;
  readonly templatesEnabled: boolean;
  readonly internalOnly: boolean;
  readonly allowedExternalDomains: readonly string[];
  readonly allowedExternalEmails: readonly string[];
  readonly templates: EmailTemplateRegistry;
  readonly smtp: SmtpTransportConfig | null;
};

export async function loadEmailChannelConfiguration(
  settingsService: SettingsService,
): Promise<EmailChannelConfiguration> {
  const smtpEnabled = (await settingsService.getSetting(
    settingKeys.privateSmtpEnabled,
  )) === true;
  const emailAddonEnabled = (await settingsService.getSetting(
    settingKeys.privateAddonsEmail,
  )) === true;
  const notificationsEmailEnabled = (await settingsService.getSetting(
    settingKeys.privateNotificationsEmailEnabled,
  )) === true;
  const templatesEnabled = (await settingsService.getSetting(
    settingKeys.privateNotificationsTemplatesEnabled,
  )) === true;
  const internalOnly = (await settingsService.getSetting(
    settingKeys.privateNotificationsEmailInternalOnly,
  )) !== false;
  const templates = templatesEnabled
    ? parseEmailTemplateRegistry(
        await settingsService.getSetting(
          settingKeys.privateNotificationsTemplatesRegistryJson,
        ),
      )
    : defaultEmailTemplates;
  return {
    deliveryEnabled: resolveEmailChannelEnabled({
      smtpEnabled,
      emailAddonEnabled,
      notificationsEmailEnabled,
    }),
    smtpEnabled,
    emailAddonEnabled,
    notificationsEmailEnabled,
    templatesEnabled,
    internalOnly,
    allowedExternalDomains: parseSettingsCsv(
      await settingsService.getSetting(
        settingKeys.privateNotificationsEmailAllowedExternalDomainsCsv,
      ),
    ),
    allowedExternalEmails: parseSettingsCsv(
      await settingsService.getSetting(
        settingKeys.privateNotificationsEmailAllowedExternalEmailsCsv,
      ),
    ),
    templates,
    smtp: smtpEnabled ? await readSmtpTransportConfig(settingsService) : null,
  };
}

async function readSmtpTransportConfig(
  settingsService: SettingsService,
): Promise<SmtpTransportConfig | null> {
  const host = asString(
    await settingsService.getSetting(settingKeys.privateSmtpHost),
  );
  const fromAddress = asString(
    await settingsService.getSetting(settingKeys.privateSmtpFromAddress),
  );
  const port = asNumber(
    await settingsService.getSetting(settingKeys.privateSmtpPort),
    587,
  );
  if (host.length === 0 || fromAddress.length === 0) {
    return null;
  }
  return {
    host,
    port,
    tls: (await settingsService.getSetting(settingKeys.privateSmtpTls)) !== false,
    username: asString(
      await settingsService.getSetting(settingKeys.privateSmtpUsername),
    ),
    password: asString(
      await settingsService.getSecretForInternalUse(
        settingKeys.privateSmtpPassword,
      ),
    ),
    fromAddress,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
