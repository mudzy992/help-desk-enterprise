import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

/**
 * M7 B5 (val 5): RAW asks for a switch over the impact/urgency matrix. The
 * matrix table is seeded data, so the switch cannot live in it — with the
 * matrix off every ticket falls back to the built-in score formula.
 */
export const ticketPriorityMatrixSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketPriorityMatrixEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Calculate ticket priority from the impact/urgency matrix table; off uses the built-in score formula',
    isRequired: true,
    defaultValue: true,
  }),
];
