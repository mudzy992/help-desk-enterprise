import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { defaultTicketCollaborationConfiguration } from './collaboration.constants';
import type { TicketCollaborationConfiguration } from './collaboration.types';
import { parseTicketCollaborationConfiguration } from './parse-ticket-collaboration-configuration';

@Injectable()
export class TicketCollaborationConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketCollaborationConfiguration> {
    try {
      return parseTicketCollaborationConfiguration({
        participantsEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketParticipantsEnabled,
        ),
        defaultParticipantRolesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketParticipantsDefaultOnCreateCsv,
        ),
        messageTypesEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketChatMessageTypesEnabled,
        ),
        allowedMessageTypesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketChatMessageTypesAllowedCsv,
        ),
      });
    } catch {
      return { ...defaultTicketCollaborationConfiguration };
    }
  }
}
