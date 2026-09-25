import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

/** Package 1.4 — response templates and playbooks (S). */
export const playbookRequiredStepsModes = ['off', 'warn', 'block'] as const;

export const ticketTemplatesSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketTemplatesEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Offer response templates in the ticket composer and the templates administration',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketPlaybooksEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Show playbook checklists on tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketPlaybooksAutoAttach,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Attach the playbook automatically on ticket creation when exactly one active playbook matches the service',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketPlaybooksRequiredStepsOnResolve,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description:
      'Open required playbook steps when resolving or closing: off, warn (confirm in the dialog) or block (409 until done)',
    isRequired: true,
    allowedValues: [...playbookRequiredStepsModes],
    defaultValue: 'warn',
  }),
];
