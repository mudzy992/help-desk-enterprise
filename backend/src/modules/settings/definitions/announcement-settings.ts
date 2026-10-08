import { definePrivateSetting, defineSecretSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { assertHttpsUrlOrEmpty } from './ops-settings';
import { SettingsError } from '../settings.error';
import type { SettingDefinition } from '../settings.types';

/** Paket 2.9 (K2, §6): defaults, also used when a value is missing. */
export const announcementDefaults = {
  enabled: false,
  maxDurationDays: 90,
  agentsMayPublish: false,
  receiptRetentionDays: 365,
  teamsEnabled: false,
} as const;

export const announcementSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateAnnouncementsEnabled,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'boolean',
    description: 'Enable announcements (banner/modal with optional read acknowledgement)',
    isRequired: true,
    defaultValue: announcementDefaults.enabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateAnnouncementsMaxDurationDays,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'number',
    description: 'Longest time an announcement may stay active (1-365 days)',
    isRequired: true,
    defaultValue: announcementDefaults.maxDurationDays,
    assertValue: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365) {
        throw new SettingsError('Maximum duration must be 1-365 days');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAnnouncementsAgentsMayPublish,
    requires: [{ key: settingKeys.privateAnnouncementsEnabled, equals: true }],
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'boolean',
    description: 'Agents may publish announcements for their own organizational unit',
    isRequired: true,
    defaultValue: announcementDefaults.agentsMayPublish,
  }),
  definePrivateSetting({
    key: settingKeys.privateAnnouncementsReceiptRetentionDays,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'number',
    description: 'Days after an announcement ends before acknowledgements are deleted (0 = keep; 30-3650)',
    isRequired: true,
    defaultValue: announcementDefaults.receiptRetentionDays,
    assertValue: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || (value !== 0 && (value < 30 || value > 3650))) {
        throw new SettingsError('Retention must be 0 or 30-3650 days');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAnnouncementsTeamsEnabled,
    requires: [{ key: settingKeys.privateAnnouncementsEnabled, equals: true }],
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'boolean',
    description: 'Offer "Post to Teams" on announcements (needs a Teams webhook URL here or in the alarm settings)',
    isRequired: true,
    defaultValue: announcementDefaults.teamsEnabled,
  }),
  defineSecretSetting({
    key: settingKeys.privateAnnouncementsTeamsWebhookUrl,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'string',
    description: 'Teams Workflows webhook URL for announcements (empty = use the alarm webhook)',
    isRequired: false,
    assertValue: assertHttpsUrlOrEmpty,
  }),
];
