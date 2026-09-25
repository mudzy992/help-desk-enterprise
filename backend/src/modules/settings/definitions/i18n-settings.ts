import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';
import { SettingsError } from '../settings.error';

const locales = ['bs', 'en'];

export const i18nSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateI18nDefaultLocale,
    categoryId: settingCategoryIds.privateI18n,
    valueType: 'string',
    description: 'Language for users who have not chosen one (e-mails and first sign-in)',
    isRequired: true,
    defaultValue: 'bs',
    allowedValues: locales,
  }),
  definePrivateSetting({
    key: settingKeys.privateI18nFallbackLocale,
    categoryId: settingCategoryIds.privateI18n,
    valueType: 'string',
    description: 'Language used when a text is missing in the preferred language',
    isRequired: true,
    defaultValue: 'en',
    allowedValues: locales,
  }),
  definePrivateSetting({
    key: settingKeys.privateI18nSupportedLocalesCsv,
    categoryId: settingCategoryIds.privateI18n,
    valueType: 'string',
    description: 'Comma-separated languages offered to users (bs, en)',
    isRequired: true,
    defaultValue: 'bs,en',
    assertValue: (value) => {
      if (typeof value !== 'string') {
        return;
      }
      const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
      if (entries.length === 0 || entries.some((entry) => !locales.includes(entry))) {
        throw new SettingsError('Supported locales must be a CSV of: bs, en', 'INVALID_SETTING_VALUE');
      }
    },
  }),
];
