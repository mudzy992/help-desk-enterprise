import { settingKeys } from '../settings/setting-keys';
import type { SettingsMutationInput } from '../settings/settings.types';
import type { SettingsService } from '../settings/settings.service';
import type { ValidatedInstallSmtp } from './install-smtp.types';

export async function persistInstallSmtp(
  settingsService: SettingsService,
  validated: ValidatedInstallSmtp,
  mutation: SettingsMutationInput,
): Promise<void> {
  if (validated.enabled === false) {
    await settingsService.setSettingValue(
      settingKeys.privateSmtpEnabled,
      false,
      mutation,
    );
    await settingsService.setSettingValue(
      settingKeys.privateAddonsEmail,
      false,
      mutation,
    );
    return;
  }
  await settingsService.setSettingValue(
    settingKeys.privateSmtpHost,
    validated.configuration.host,
    mutation,
  );
  await settingsService.setSettingValue(
    settingKeys.privateSmtpPort,
    validated.configuration.port,
    mutation,
  );
  await settingsService.setSettingValue(
    settingKeys.privateSmtpTls,
    validated.configuration.tls,
    mutation,
  );
  await settingsService.setSettingValue(
    settingKeys.privateSmtpUsername,
    validated.configuration.username,
    mutation,
  );
  await settingsService.setSettingValue(
    settingKeys.privateSmtpFromAddress,
    validated.configuration.fromAddress,
    mutation,
  );
  await persistSmtpPassword(settingsService, validated, mutation);
  await settingsService.setSettingValue(
    settingKeys.privateSmtpEnabled,
    true,
    mutation,
  );
}

async function persistSmtpPassword(
  settingsService: SettingsService,
  validated: Extract<ValidatedInstallSmtp, { enabled: true }>,
  mutation: SettingsMutationInput,
): Promise<void> {
  if (
    !validated.persistPassword &&
    (await settingsService.hasStoredValue(settingKeys.privateSmtpPassword))
  ) {
    return;
  }
  await settingsService.setSettingValue(
    settingKeys.privateSmtpPassword,
    validated.configuration.password,
    mutation,
  );
}
