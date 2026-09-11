import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const addonSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateAddonsEmail,
    valueType: 'boolean',
    description:
      'Email addon flag from the install wizard catalog; SMTP off always wins',
    isRequired: true,
    defaultValue: false,
  }),
];
