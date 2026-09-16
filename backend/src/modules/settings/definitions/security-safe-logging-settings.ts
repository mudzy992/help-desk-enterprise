import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';
import {
  defaultSafeLoggingLevelsCsv,
  defaultSafeLoggingRedactFieldsCsv,
} from '../../tickets/safe-logging/safe-logging.constants';

export const securitySafeLoggingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecuritySafeLoggingEnabled,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'boolean',
    description: 'Omit confidential and restricted ticket content from application logs',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecuritySafeLoggingLevelsCsv,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description: 'Data classification levels that use safe logging',
    isRequired: true,
    defaultValue: defaultSafeLoggingLevelsCsv,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecuritySafeLoggingRedactFieldsCsv,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description: 'Ticket fields omitted from application logs under safe logging',
    isRequired: true,
    defaultValue: defaultSafeLoggingRedactFieldsCsv,
  }),
];
