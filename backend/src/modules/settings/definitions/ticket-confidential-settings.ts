import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { defaultBreakGlassAllowedRolesCsv } from '../../tickets/confidential/confidential.constants';

export const ticketConfidentialSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialEnabled,
    valueType: 'boolean',
    description: 'Enforce per-ticket confidential ACL for tickets, messages, and attachments',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialDefaultForServicesCsv,
    valueType: 'string',
    description: 'Service ids that create confidential tickets by default',
    isRequired: true,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialAllowedViewerRolesCsv,
    valueType: 'string',
    description: 'Roles that may view confidential tickets without break-glass, still within OU/service scope',
    isRequired: true,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialAllowedViewerGroupIdsCsv,
    valueType: 'string',
    description: 'Group ids that may view confidential tickets without break-glass, still within OU/service scope',
    isRequired: true,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialBreakGlassEnabled,
    valueType: 'boolean',
    description: 'Allow authorized break-glass access to confidential tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialBreakGlassAllowedRolesCsv,
    valueType: 'string',
    description: 'Roles allowed to request break-glass, in addition to confidential.break_glass permission',
    isRequired: true,
    defaultValue: defaultBreakGlassAllowedRolesCsv,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialBreakGlassRequiresReason,
    valueType: 'boolean',
    description: 'Require a reason for every break-glass request',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketConfidentialAuditViews,
    valueType: 'boolean',
    description: 'Audit every confidential ticket view and denied access',
    isRequired: true,
    defaultValue: true,
  }),
];
