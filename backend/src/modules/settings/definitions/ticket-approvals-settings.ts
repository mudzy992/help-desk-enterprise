import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketApprovalsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketApprovalsEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Enable Pending Approval hold for services that require approval',
    isRequired: true,
    defaultValue: true,
  }),
  defineSecretSetting({
    key: settingKeys.privateTicketApprovalsRequiredByServiceJson,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description:
      'JSON map of serviceId to approval policy overlay; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketApprovalsDefaultApproverRole,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Role that may approve or reject tickets in scope',
    isRequired: true,
    allowedValues: ['ADMIN', 'AGENT', 'SUPER_ADMIN'],
    defaultValue: 'ADMIN',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketApprovalsAllowRequesterManager,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Use the requester AD manager as approver when directory manager data is available',
    isRequired: true,
    defaultValue: false,
  }),
];
