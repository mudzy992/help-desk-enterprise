import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const ticketCsatSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateCsatEnabled,
    valueType: 'boolean',
    description: 'Enable CSAT feedback after resolve or close',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatScaleMax,
    valueType: 'number',
    description: 'Maximum CSAT rating (typically 5)',
    isRequired: true,
    defaultValue: 5,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatAskOnResolved,
    valueType: 'boolean',
    description: 'Ask for CSAT when a ticket is RESOLVED',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatAskOnClosed,
    valueType: 'boolean',
    description: 'Ask for CSAT when a ticket is CLOSED',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateCsatSamplingRate,
    valueType: 'number',
    description: 'Fraction of tickets that receive a CSAT prompt (0–1)',
    isRequired: true,
    defaultValue: 1,
  }),
];
