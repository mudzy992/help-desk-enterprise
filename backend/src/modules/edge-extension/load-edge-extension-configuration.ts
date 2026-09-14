import {
  defaultEdgeExtensionAllowedEmailDomain,
  defaultEdgeExtensionChatMaxMessagesPerTicket,
  defaultEdgeExtensionPollingIntervalSeconds,
  defaultEdgeExtensionReconnectMaxBackoffSeconds,
  defaultEdgeExtensionRemoteRateLimitMinutes,
  edgeExtensionPollingIntervalMaximumSeconds,
  edgeExtensionPollingIntervalMinimumSeconds,
} from '../settings/definitions/edge-extension-settings';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import type { EdgeExtensionConfiguration } from './edge-extension.types';

export async function loadEdgeExtensionConfiguration(
  settingsService: SettingsService,
): Promise<EdgeExtensionConfiguration> {
  return {
    addonEnabled:
      (await settingsService.getSetting(settingKeys.privateAddonsEdge)) === true,
    moduleEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionEnabled,
      )) !== false,
    notificationsEdgeEnabled:
      (await settingsService.getSetting(
        settingKeys.privateNotificationsEdgeEnabled,
      )) !== false,
    killSwitchEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionKillSwitchEnabled,
      )) !== false,
    wsEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionWsEnabled,
      )) !== false,
    reconnectMaxBackoffSeconds: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateEdgeExtensionWsReconnectMaxBackoffSeconds,
      ),
      defaultEdgeExtensionReconnectMaxBackoffSeconds,
    ),
    minClientVersion: asString(
      await settingsService.getSetting(
        settingKeys.privateEdgeExtensionWsMinClientVersion,
      ),
    ),
    redactedPreviews:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionNotificationsRedactedPreviews,
      )) !== false,
    receiptsEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionReceiptsEnabled,
      )) !== false,
    dedupEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionEventsDedupEnabled,
      )) !== false,
    pollingFallbackEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionPollingFallbackEnabled,
      )) !== false,
    pollingIntervalSeconds: clampPollingInterval(
      await settingsService.getSetting(
        settingKeys.privateEdgeExtensionPollingFallbackIntervalSeconds,
      ),
    ),
    allowedEmailDomain:
      asString(
        await settingsService.getSetting(
          settingKeys.privateEdgeExtensionAllowedEmailDomain,
        ),
      ) || defaultEdgeExtensionAllowedEmailDomain,
    chatEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionChatEnabled,
      )) !== false,
    chatMaxMessagesPerTicket: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateEdgeExtensionChatMaxMessagesPerTicket,
      ),
      defaultEdgeExtensionChatMaxMessagesPerTicket,
    ),
    attachmentsEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionAttachmentsEnabled,
      )) === true,
    remoteEnabled:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionRemoteEnabled,
      )) !== false,
    remoteRateLimitMinutesPerTicket: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateEdgeExtensionRemoteRateLimitMinutesPerTicket,
      ),
      defaultEdgeExtensionRemoteRateLimitMinutes,
    ),
    requireUserClickToOpenQuickAssist:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionRemoteRequireUserClickToOpenQuickAssist,
      )) !== false,
    auditAcknowledge:
      (await settingsService.getSetting(
        settingKeys.privateEdgeExtensionRemoteAuditAcknowledge,
      )) !== false,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function clampPollingInterval(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : defaultEdgeExtensionPollingIntervalSeconds;
  return Math.min(
    edgeExtensionPollingIntervalMaximumSeconds,
    Math.max(edgeExtensionPollingIntervalMinimumSeconds, numeric),
  );
}
