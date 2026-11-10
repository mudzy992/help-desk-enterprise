import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import {
  defaultTemplatesConfiguration,
  type PlaybookRequiredStepsMode,
  type TemplatesConfiguration,
} from './templates.constants';

const modes: readonly PlaybookRequiredStepsMode[] = ['off', 'warn', 'block'];

export function parseTemplatesConfiguration(values: {
  readonly templatesEnabled: unknown;
  readonly playbooksEnabled: unknown;
  readonly autoAttach: unknown;
  readonly requiredStepsOnResolve: unknown;
}): TemplatesConfiguration {
  const d = defaultTemplatesConfiguration;
  return {
    templatesEnabled: typeof values.templatesEnabled === 'boolean' ? values.templatesEnabled : d.templatesEnabled,
    playbooksEnabled: typeof values.playbooksEnabled === 'boolean' ? values.playbooksEnabled : d.playbooksEnabled,
    autoAttach: typeof values.autoAttach === 'boolean' ? values.autoAttach : d.autoAttach,
    requiredStepsOnResolve: modes.includes(values.requiredStepsOnResolve as PlaybookRequiredStepsMode)
      ? (values.requiredStepsOnResolve as PlaybookRequiredStepsMode)
      : d.requiredStepsOnResolve,
  };
}

/** Package 1.4 (S). Tolerant: a broken value falls back to the default. */
@Injectable()
export class TemplatesConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TemplatesConfiguration> {
    const read = async (key: string) => {
      try {
        return await this.settingsService.getSetting(key);
      } catch {
        return undefined;
      }
    };
    const [templatesEnabled, playbooksEnabled, autoAttach, requiredStepsOnResolve] =
      await Promise.all([
        read(settingKeys.privateTicketTemplatesEnabled),
        read(settingKeys.privateTicketPlaybooksEnabled),
        read(settingKeys.privateTicketPlaybooksAutoAttach),
        read(settingKeys.privateTicketPlaybooksRequiredStepsOnResolve),
      ]);
    return parseTemplatesConfiguration({
      templatesEnabled,
      playbooksEnabled,
      autoAttach,
      requiredStepsOnResolve,
    });
  }
}
