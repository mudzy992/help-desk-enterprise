import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

/**
 * M5 B2 (val 5): packs are defined in code (`policy-pack.registry.ts`), so this
 * setting does not create packs — it lets an installation switch a pack off
 * without a deployment. Disabled packs cannot be applied or validated; they can
 * still be unapplied, otherwise a switched-off pack could never be cleaned up.
 */
export const policyPackSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privatePolicyPacksDisabledKeysCsv,
    categoryId: settingCategoryIds.privateServices,
    valueType: 'string',
    description:
      'Comma-separated policy pack keys that may not be applied (for example PACK_HR_RESTRICTED)',
    isRequired: true,
    defaultValue: '',
  }),
];
