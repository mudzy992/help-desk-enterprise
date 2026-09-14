import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import type { IntegrationQueueSettings } from './integration-queue.types';
import { parseIntegrationQueueTypeTokens } from './parse-integration-queue-types';

export async function loadIntegrationQueueSettings(
  settingsService: SettingsService,
): Promise<IntegrationQueueSettings> {
  return {
    enabled:
      (await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueEnabled,
      )) !== false,
    typeTokens: parseIntegrationQueueTypeTokens(
      await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueTypesCsv,
      ),
    ),
    maxAttempts: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueMaxAttempts,
      ),
      10,
    ),
    initialBackoffSeconds: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueInitialBackoffSeconds,
      ),
      60,
    ),
    maxBackoffSeconds: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueMaxBackoffSeconds,
      ),
      3600,
    ),
    deadLetterAfterAttempts: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueDeadLetterAfterAttempts,
      ),
      10,
    ),
    deadLetterRetentionDays: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueDeadLetterRetentionDays,
      ),
      30,
    ),
    workerPollSeconds: asPositiveNumber(
      await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueWorkerPollSeconds,
      ),
      5,
    ),
    adminUiEnabled:
      (await settingsService.getSetting(
        settingKeys.privateIntegrationsQueueAdminUiEnabled,
      )) !== false,
  };
}

function asPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
