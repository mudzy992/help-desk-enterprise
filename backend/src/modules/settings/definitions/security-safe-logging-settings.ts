import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import {
  defaultSafeLoggingLevelsCsv,
  defaultSafeLoggingRedactFieldsCsv,
} from '../../tickets/safe-logging/safe-logging.constants';

export const securitySafeLoggingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecuritySafeLoggingEnabled,
    valueType: 'boolean',
    description: 'Omit confidential and restricted ticket content from application logs',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecuritySafeLoggingLevelsCsv,
    valueType: 'string',
    description: 'Data classification levels that use safe logging',
    isRequired: true,
    defaultValue: defaultSafeLoggingLevelsCsv,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecuritySafeLoggingRedactFieldsCsv,
    valueType: 'string',
    description: 'Ticket fields omitted from application logs under safe logging',
    isRequired: true,
    defaultValue: defaultSafeLoggingRedactFieldsCsv,
  }),
];
