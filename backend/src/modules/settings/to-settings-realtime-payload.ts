import { settingKeys } from './setting-keys';
import type { SettingDefinition } from './settings.types';
import type { SettingsUpdatedRealtimePayload } from './settings-realtime.types';

const sessionInvalidatingKeys = new Set<string>([
  settingKeys.privateAuthJwtSigningSecret,
  settingKeys.privateAuthMode,
]);

export function toSettingsRealtimePayload(
  definition: SettingDefinition,
): SettingsUpdatedRealtimePayload | null {
  if (!shouldBroadcastSetting(definition.key)) {
    return null;
  }
  return {
    key: definition.key,
    visibility: definition.visibility,
    occurredAt: new Date().toISOString(),
    invalidatesSession: sessionInvalidatingKeys.has(definition.key),
  };
}

export function shouldBroadcastSetting(key: string): boolean {
  return (
    key.startsWith('public.') ||
    key.startsWith('private.readOnlyMode.') ||
    key.startsWith('private.notifications.') ||
    key.startsWith('private.addons.') ||
    key === settingKeys.privateAuthMode ||
    key === settingKeys.privateAuthJwtSigningSecret ||
    key === settingKeys.privateInstallCompletedAt
  );
}
