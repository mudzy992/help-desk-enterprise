import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { AuthenticationError } from './authentication.error';
import type { EntraAuthenticationConfiguration } from './entra-authentication.configuration';
import { parseEntraAuthenticationConfiguration } from './parse-entra-authentication-configuration';

@Injectable()
export class EntraAuthenticationConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<EntraAuthenticationConfiguration> {
    try {
      return parseEntraAuthenticationConfiguration({
        tenantId: await this.settingsService.getSecretForInternalUse(
          settingKeys.privateAuthAzureTenantId,
        ),
        clientId: await this.settingsService.getSecretForInternalUse(
          settingKeys.privateAuthAzureClientId,
        ),
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
    }
  }
}
