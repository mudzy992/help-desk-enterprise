import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketCsatSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateCsatEnabled,
    categoryId: settingCategoryIds.privateCsat,
    valueType: 'boolean',
    description: 'Enable CSAT feedback after resolve or close',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatScaleMax,
    categoryId: settingCategoryIds.privateCsat,
    valueType: 'number',
    description: 'Maximum CSAT rating (typically 5)',
    isRequired: true,
    defaultValue: 5,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatAskOnResolved,
    categoryId: settingCategoryIds.privateCsat,
    valueType: 'boolean',
    description: 'Ask for CSAT when a ticket is RESOLVED',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatAskOnClosed,
    categoryId: settingCategoryIds.privateCsat,
    valueType: 'boolean',
    description: 'Ask for CSAT when a ticket is CLOSED',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatSamplingRate,
    categoryId: settingCategoryIds.privateCsat,
    valueType: 'number',
    description: 'Fraction of tickets that receive a CSAT prompt (0–1)',
    isRequired: true,
    defaultValue: 1,
  }),
];
