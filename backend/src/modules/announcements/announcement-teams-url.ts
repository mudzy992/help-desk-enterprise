import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';

/**
 * Paket 2.9 (K2b): the announcement webhook, else the operational alarm
 * webhook of 2.7 (one channel is enough for most installations); https only.
 */
export async function resolveAnnouncementTeamsUrl(settings: SettingsService): Promise<string | null> {
  for (const key of [settingKeys.privateAnnouncementsTeamsWebhookUrl, settingKeys.privateOpsAlertsTeamsWebhookUrl]) {
    const value = await settings.getSecretForInternalUse(key).catch(() => undefined);
    if (typeof value === 'string' && value.trim().startsWith('https://')) return value.trim();
  }
  return null;
}
