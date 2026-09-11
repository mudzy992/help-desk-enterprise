import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketArchiveConfiguration } from './parse-ticket-archive-configuration';
import type { TicketArchiveConfiguration } from './archive.types';

@Injectable()
export class TicketArchiveConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketArchiveConfiguration> {
    try {
      return parseTicketArchiveConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateDataLifecycleArchiveEnabled,
        ),
        afterClosedDays: await this.settingsService.getSetting(
          settingKeys.privateDataLifecycleArchiveAfterClosedDays,
        ),
        archivedReadOnly: await this.settingsService.getSetting(
          settingKeys.privateDataLifecycleArchiveArchivedReadOnly,
        ),
        searchable: await this.settingsService.getSetting(
          settingKeys.privateDataLifecycleArchiveSearchable,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('ARCHIVE_UNAVAILABLE');
    }
  }
}
