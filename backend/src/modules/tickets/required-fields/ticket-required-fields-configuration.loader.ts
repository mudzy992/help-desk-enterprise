import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketRequiredFieldsConfiguration } from './parse-ticket-required-fields-configuration';
import type { TicketRequiredFieldsConfiguration } from './required-fields.types';

@Injectable()
export class TicketRequiredFieldsConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketRequiredFieldsConfiguration> {
    try {
      return parseTicketRequiredFieldsConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateWorkflowRequiredFieldsEnabled,
        ),
        globalRequiredOnResolveCsv: await this.settingsService.getSetting(
          settingKeys.privateWorkflowRequiredFieldsGlobalRequiredOnResolveCsv,
        ),
        byServiceJson: await this.settingsService.getSecretForInternalUse(
          settingKeys.privateWorkflowRequiredFieldsByServiceJson,
        ),
        enforceSchemaRequiredFields: await this.settingsService.getSetting(
          settingKeys.privateTicketFormsRequireStructuredFields,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('REQUIRED_FIELDS_UNAVAILABLE');
    }
  }
}
