import { settingKeys } from '../settings/setting-keys';
import type { SettingsMutationInput } from '../settings/settings.types';
import type { SettingsService } from '../settings/settings.service';
import type { ValidatedInstallLoginProvider } from './install-login-provider.types';

export async function persistInstallLoginProvider(
  settingsService: SettingsService,
  validated: ValidatedInstallLoginProvider,
  mutation: SettingsMutationInput,
): Promise<void> {
  if (validated.mode === 'entra_ad') {
    if (validated.entra !== null) {
      await settingsService.setSettingValue(
        settingKeys.privateAuthAzureTenantId,
        validated.entra.tenantId,
        mutation,
      );
      await settingsService.setSettingValue(
        settingKeys.privateAuthAzureClientId,
        validated.entra.clientId,
        mutation,
      );
    }
    if (validated.directoryBind !== null) {
      await settingsService.setSettingValue(
        settingKeys.privateAuthAdLdapsUrlsCsv,
        validated.directoryBind.urlsCsv,
        mutation,
      );
      await settingsService.setSettingValue(
        settingKeys.privateAuthAdBindDn,
        validated.directoryBind.bindDn,
        mutation,
      );
      await settingsService.setSettingValue(
        settingKeys.privateAuthAdBindPassword,
        validated.directoryBind.bindPassword,
        mutation,
      );
    }
  }
  await settingsService.setSettingValue(
    settingKeys.privateAuthMode,
    validated.mode,
    mutation,
  );
}
