import {
  addonSettingKey,
  installAddonCatalog,
} from '../addon-catalog';
import { definePrivateSetting } from '../registry/define-setting';
import type { SettingDefinition } from '../settings.types';

export const addonSettings: readonly SettingDefinition[] =
  installAddonCatalog.map((item) =>
    definePrivateSetting({
      key: addonSettingKey(item.key),
      valueType: 'boolean',
      description: item.description,
      isRequired: true,
      defaultValue: item.defaultEnabled,
    }),
  );
