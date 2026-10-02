import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { isSimulatorSecretConfigured } from './simulator-signature';

/**
 * Paket 3.1: dependency-free availability check for other modules (preferences
 * UI, profile). True when the addon is on, the mode is usable and personal
 * notifications are enabled.
 */
export async function isTeamsPersonalChannelAvailable(settings: SettingsService): Promise<boolean> {
  const read = async (key: string): Promise<unknown> => {
    try {
      return await settings.getSetting(key);
    } catch {
      return undefined;
    }
  };
  if ((await read(settingKeys.privateAddonsTeams)) !== true) return false;
  if ((await read(settingKeys.privateIntegrationsTeamsPersonalEnabled)) === false) return false;
  const mode = await read(settingKeys.privateIntegrationsTeamsMode);
  return mode === 'live' || isSimulatorSecretConfigured(process.env.TEAMS_SIMULATOR_SECRET);
}
