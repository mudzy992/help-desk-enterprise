import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const serviceLifecycleSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateServicesLifecycleEnabled,
    valueType: 'boolean',
    description:
      'Master switch for service catalog lifecycle enforcement; off blocks transitions',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesLifecycleAllowedStatesCsv,
    valueType: 'string',
    description:
      'Comma-separated service lifecycle states that may be stored or targeted',
    isRequired: true,
    defaultValue: 'DRAFT,ACTIVE,DEPRECATED',
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesLifecycleDefaultStateOnCreate,
    valueType: 'string',
    description:
      'Lifecycle assigned on service create; must be in the allowed-states list',
    isRequired: true,
    allowedValues: ['DRAFT', 'ACTIVE', 'DEPRECATED'],
    defaultValue: 'DRAFT',
  }),
];
