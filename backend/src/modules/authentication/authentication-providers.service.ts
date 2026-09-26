import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { AuthenticationModeLoader } from './authentication-mode.loader';
import { EntraAuthenticationConfigurationLoader } from './entra-authentication-configuration.loader';

export type AuthenticationProvidersResponse = {
  readonly mode: 'local' | 'entra_ad';
  /** Public OIDC parameters for the browser (MSAL); never a secret. */
  readonly entra: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly authority: string;
    readonly singleLogout: boolean;
  } | null;
};

/**
 * Paket 1.8 (A1): what the login page should offer. Tenant and client id are
 * visible in every OIDC request anyway; nothing else is exposed.
 */
@Injectable()
export class AuthenticationProvidersService {
  constructor(
    private readonly modeLoader: AuthenticationModeLoader,
    private readonly entraConfigurationLoader: EntraAuthenticationConfigurationLoader,
    private readonly settingsService: SettingsService,
  ) {}

  async describe(): Promise<AuthenticationProvidersResponse> {
    let mode: 'local' | 'entra_ad';
    try {
      mode = (await this.modeLoader.load()) === 'entra_ad' ? 'entra_ad' : 'local';
    } catch {
      return { mode: 'local', entra: null };
    }
    if (mode !== 'entra_ad') {
      return { mode, entra: null };
    }
    try {
      const configuration = await this.entraConfigurationLoader.load();
      const singleLogout =
        (await this.settingsService
          .getSetting(settingKeys.privateAuthEntraSingleLogout)
          .catch(() => false)) === true;
      return {
        mode,
        entra: {
          tenantId: configuration.tenantId,
          clientId: configuration.clientId,
          authority: `https://login.microsoftonline.com/${configuration.tenantId}`,
          singleLogout,
        },
      };
    } catch {
      // Entra mode without tenant/client: the login page falls back to the
      // break-glass form and says that Microsoft sign-in is not configured.
      return { mode, entra: null };
    }
  }
}
