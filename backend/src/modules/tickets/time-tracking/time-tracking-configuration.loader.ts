import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTimeTrackingConfiguration } from './parse-time-tracking-configuration';
import type {
  TimeTrackingConfiguration,
  TimeTrackingConfigurationSource,
} from './time-tracking.types';

@Injectable()
export class TimeTrackingConfigurationLoader implements TimeTrackingConfigurationSource {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TimeTrackingConfiguration> {
    try {
      const read = (key: string) => this.settingsService.getSetting(key);
      const [
        idleAutoPauseMinutes,
        autoResume,
        maxSessionHours,
        singleActivePerUser,
        manualEntryEnabled,
        maxBackdateDays,
        manualMaxMinutes,
      ] = await Promise.all([
        read(settingKeys.privateTimeTrackingIdleAutoPauseMinutes),
        read(settingKeys.privateTimeTrackingAutoResume),
        read(settingKeys.privateTimeTrackingMaxSessionHours),
        read(settingKeys.privateTimeTrackingSingleActivePerUser),
        read(settingKeys.privateTimeTrackingManualEntryEnabled),
        read(settingKeys.privateTimeTrackingManualEntryMaxBackdateDays),
        read(settingKeys.privateTimeTrackingManualEntryMaxMinutes),
      ]);
      return parseTimeTrackingConfiguration({
        idleAutoPauseMinutes,
        autoResume,
        maxSessionHours,
        singleActivePerUser,
        manualEntryEnabled,
        maxBackdateDays,
        manualMaxMinutes,
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('TIME_TRACKING_UNAVAILABLE');
    }
  }
}
