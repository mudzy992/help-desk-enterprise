import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import {
  recordTemplatesConfigurationReadFailure,
  recordTemplatesConfigurationReadRecovery,
  readTemplatesConfigurationHealth,
} from './templates-configuration-health';
import {
  defaultTemplatesConfiguration,
  type PlaybookRequiredStepsMode,
  type TemplatesConfiguration,
} from './templates.constants';

const modes: readonly PlaybookRequiredStepsMode[] = ['off', 'warn', 'block'];

const templateConfigurationKeys = [
  settingKeys.privateTicketTemplatesEnabled,
  settingKeys.privateTicketPlaybooksEnabled,
  settingKeys.privateTicketPlaybooksAutoAttach,
  settingKeys.privateTicketPlaybooksRequiredStepsOnResolve,
] as const;

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

/**
 * Package 1.4 (S). A settings I/O error is not a malformed/missing value: fail
 * the operation closed instead of substituting enabled defaults or downgrading
 * `block` to `warn`. A complete successful read clears the degraded health signal.
 */
@Injectable()
export class TemplatesConfigurationLoader {
  private readonly logger = new Logger(TemplatesConfigurationLoader.name);

  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TemplatesConfiguration> {
    const reads = await Promise.allSettled(
      templateConfigurationKeys.map((key) => this.settingsService.getSetting(key)),
    );
    const failedSettingCount = reads.filter((read) => read.status === 'rejected').length;

    if (failedSettingCount > 0) {
      const signal = recordTemplatesConfigurationReadFailure();
      // This is a low-cardinality metric line as well as a warning. Do not log
      // the database error or setting values; only a count and the fail-closed
      // policy are operationally useful here.
      this.logger.warn(
        `templates_configuration_read_failure_total=${signal.readFailuresTotal} templates_configuration_health=degraded policy=fail_closed failed_setting_count=${failedSettingCount}`,
      );
      throw new ServiceUnavailableException({
        code: 'TEMPLATES_CONFIGURATION_UNAVAILABLE',
        message: 'Template settings are temporarily unavailable',
      });
    }

    const values = reads.map((read) =>
      read.status === 'fulfilled' ? read.value : undefined,
    );
    const configuration = parseTemplatesConfiguration({
      templatesEnabled: values[0],
      playbooksEnabled: values[1],
      autoAttach: values[2],
      requiredStepsOnResolve: values[3],
    });

    if (readTemplatesConfigurationHealth().status === 'degraded') {
      const signal = recordTemplatesConfigurationReadRecovery();
      this.logger.log(
        `templates_configuration_health=ok templates_configuration_recovered=1 templates_configuration_read_failure_total=${signal.readFailuresTotal}`,
      );
    }

    return configuration;
  }
}
