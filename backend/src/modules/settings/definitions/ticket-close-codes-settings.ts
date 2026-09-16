import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultCloseCodesCsv =
  'solved_by_user,howto,access_granted,config_change,bug_fixed,hardware_replaced,other';

export const ticketCloseCodesSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketCloseCodesEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Require resolution codes from the allow-list when resolving tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketCloseCodesAllowedCodesCsv,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Allow-list of close code keys used on resolve and close',
    isRequired: true,
    defaultValue: defaultCloseCodesCsv,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketCloseCodesRequireOnResolve,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Require a close code when a ticket is moved to RESOLVED',
    isRequired: true,
    defaultValue: true,
  }),
];
