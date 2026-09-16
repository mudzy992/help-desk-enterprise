import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

const defaultAllowedMimeTypes =
  'application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const ticketAttachmentSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Enable ticket file attachments',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsMaxFileSizeMb,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Maximum attachment size in megabytes',
    isRequired: true,
    defaultValue: 25,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsAllowedMimeTypesCsv,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Allow-list of attachment MIME types',
    isRequired: true,
    defaultValue: defaultAllowedMimeTypes,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsAllowedExtensionsCsv,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Allow-list of attachment file extensions',
    isRequired: true,
    defaultValue: 'pdf,png,jpg,jpeg,docx,xlsx',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsMaxFilesPerTicket,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Maximum attachments stored on one ticket',
    isRequired: true,
    defaultValue: 10,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsMaxFilesPerMessage,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Maximum attachments stored on one ticket message',
    isRequired: true,
    defaultValue: 5,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsDangerousExtensionsBlocklistCsv,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Blocked attachment file extensions',
    isRequired: true,
    defaultValue: 'exe,msi,bat,cmd,ps1,vbs,js,jar,com,scr',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAttachmentsRetentionDays,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Retention window for ticket attachments in days',
    isRequired: true,
    defaultValue: 365,
  }),
];
