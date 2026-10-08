import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketSavedViewsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketSavedViewsEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Allow per-user saved ticket list views',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSavedViewsMaxPerUser,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Maximum saved views a user may keep',
    isRequired: true,
    defaultValue: 20,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSavedViewsAllowDefaultView,
    requires: [{ key: settingKeys.privateTicketSavedViewsEnabled, equals: true }],
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Allow marking one saved view as the user default',
    isRequired: true,
    defaultValue: true,
  }),
];
