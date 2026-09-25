import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import {
  defaultUnroutedQueueConfiguration,
  type UnroutedQueueConfiguration,
} from './unrouted-queue.types';

/**
 * Package 1.7 (U1–U4). Tolerant by design: a broken value falls back to the
 * default so the sweep and the status-flow screen never fail on it.
 */
@Injectable()
export class UnroutedQueueConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<UnroutedQueueConfiguration> {
    const read = async (key: string) => {
      try {
        return await this.settingsService.getSetting(key);
      } catch {
        return undefined;
      }
    };
    const [enabled, ownerRole, targetGroupId, cleanupSlaHours, weeklyDigest] =
      await Promise.all([
        read(settingKeys.privateTicketUnroutedQueueEnabled),
        read(settingKeys.privateTicketUnroutedQueueOwnerRole),
        read(settingKeys.privateTicketUnroutedQueueTargetGroupId),
        read(settingKeys.privateTicketUnroutedQueueCleanupSlaHours),
        read(settingKeys.privateTicketUnroutedQueueWeeklyDigest),
      ]);
    const d = defaultUnroutedQueueConfiguration;
    return {
      enabled: typeof enabled === 'boolean' ? enabled : d.enabled,
      ownerRole:
        typeof ownerRole === 'string' && ownerRole.trim().length > 0
          ? ownerRole.trim()
          : d.ownerRole,
      targetGroupId:
        typeof targetGroupId === 'string' && targetGroupId.trim().length > 0
          ? targetGroupId.trim()
          : null,
      cleanupSlaHours:
        typeof cleanupSlaHours === 'number' &&
        Number.isInteger(cleanupSlaHours) &&
        cleanupSlaHours >= 0 &&
        cleanupSlaHours <= 168
          ? cleanupSlaHours
          : d.cleanupSlaHours,
      weeklyDigest: typeof weeklyDigest === 'boolean' ? weeklyDigest : d.weeklyDigest,
    };
  }
}
