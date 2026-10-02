import { Injectable } from '@nestjs/common';
import { readPublicAppUrl } from '../notifications/email/load-email-channel-configuration';
import { teamsDefaults, type TeamsConnectorModeSetting } from '../settings/definitions/teams-integration-settings';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { isSimulatorSecretConfigured } from './simulator-signature';
import { toTeamsLocale, type TeamsLocale } from './teams-text';

export type TeamsEffectiveMode = 'off' | TeamsConnectorModeSetting;

export interface TeamsConfiguration {
  readonly mode: TeamsEffectiveMode;
  /** Configured mode, also when the effective mode is off (for the readiness screen). */
  readonly configuredMode: TeamsConnectorModeSetting;
  readonly addonEnabled: boolean;
  readonly simulatorSecretConfigured: boolean;
  readonly tenantId: string;
  readonly botAppId: string;
  readonly personalEnabled: boolean;
  readonly channelEnabled: boolean;
  readonly channelIncludeTitle: boolean;
  readonly ticketCreateEnabled: boolean;
  readonly actionsEnabled: boolean;
  readonly appName: string;
  readonly publicUrl: string | null;
  readonly defaultLocale: TeamsLocale;
}

/**
 * Paket 3.1 (§5, §14): one read of every connector setting. The effective mode
 * is `off` without the addon, and simulator mode needs TEAMS_SIMULATOR_SECRET.
 */
@Injectable()
export class TeamsConfigurationService {
  constructor(private readonly settings: SettingsService) {}

  private async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await this.settings.getSetting(key);
      return value === undefined || value === null ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  async load(): Promise<TeamsConfiguration> {
    const addonEnabled = (await this.read<unknown>(settingKeys.privateAddonsTeams, false)) === true;
    const rawMode = await this.read<string>(settingKeys.privateIntegrationsTeamsMode, teamsDefaults.mode);
    const configuredMode: TeamsConnectorModeSetting = rawMode === 'live' ? 'live' : 'simulator';
    const simulatorSecretConfigured = isSimulatorSecretConfigured(process.env.TEAMS_SIMULATOR_SECRET);
    const mode: TeamsEffectiveMode = !addonEnabled ? 'off' : configuredMode === 'simulator' && !simulatorSecretConfigured ? 'off' : configuredMode;
    const appName = String(await this.read<string>(settingKeys.publicBrandingAppName, '')).trim();
    return {
      mode,
      configuredMode,
      addonEnabled,
      simulatorSecretConfigured,
      tenantId: String(await this.read<string>(settingKeys.privateIntegrationsTeamsTenantId, '')).trim(),
      botAppId: String(await this.read<string>(settingKeys.privateIntegrationsTeamsBotAppId, '')).trim(),
      personalEnabled: (await this.read<boolean>(settingKeys.privateIntegrationsTeamsPersonalEnabled, teamsDefaults.personalEnabled)) === true,
      channelEnabled: (await this.read<boolean>(settingKeys.privateIntegrationsTeamsChannelEnabled, teamsDefaults.channelEnabled)) === true,
      channelIncludeTitle: (await this.read<boolean>(settingKeys.privateIntegrationsTeamsChannelIncludeTitle, teamsDefaults.channelIncludeTitle)) === true,
      ticketCreateEnabled: (await this.read<boolean>(settingKeys.privateIntegrationsTeamsTicketCreateEnabled, teamsDefaults.ticketCreateEnabled)) === true,
      actionsEnabled: (await this.read<boolean>(settingKeys.privateIntegrationsTeamsActionsEnabled, teamsDefaults.actionsEnabled)) === true,
      appName,
      publicUrl: readPublicAppUrl(),
      defaultLocale: toTeamsLocale(await this.read<string>(settingKeys.privateI18nDefaultLocale, 'bs')),
    };
  }

  /** Live credentials are secrets and are read only when a transport needs them. */
  async loadBotSecret(): Promise<string> {
    try {
      const value = await this.settings.getSecretForInternalUse(settingKeys.privateIntegrationsTeamsBotAppSecret);
      return typeof value === 'string' ? value.trim() : '';
    } catch {
      return '';
    }
  }

  async loadBotCertificate(): Promise<string> {
    try {
      const value = await this.settings.getSecretForInternalUse(settingKeys.privateIntegrationsTeamsBotCertificatePem);
      return typeof value === 'string' ? value.trim() : '';
    } catch {
      return '';
    }
  }
}
