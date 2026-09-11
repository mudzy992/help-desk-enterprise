import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { parseRoutingConfiguration } from './parse-routing-configuration';
import { RoutingError } from './routing.error';
import type { RoutingConfiguration } from './routing.types';

@Injectable()
export class RoutingConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<RoutingConfiguration> {
    try {
      return parseRoutingConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketUnroutedQueueEnabled,
        ),
        ownerRole: await this.settingsService.getSetting(
          settingKeys.privateTicketUnroutedQueueOwnerRole,
        ),
      });
    } catch (error) {
      if (error instanceof RoutingError) {
        throw error;
      }
      throw new RoutingError('UNAVAILABLE');
    }
  }
}
