import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const dataLifecycleSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateDataLifecycleArchiveEnabled,
    categoryId: settingCategoryIds.privateDataLifecycle,
    valueType: 'boolean',
    description: 'Automatically archive closed tickets after the configured delay',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateDataLifecycleArchiveAfterClosedDays,
    categoryId: settingCategoryIds.privateDataLifecycle,
    valueType: 'number',
    description: 'Days after CLOSED before a ticket is archived',
    isRequired: true,
    defaultValue: 30,
  }),
  definePrivateSetting({
    key: settingKeys.privateDataLifecycleArchiveArchivedReadOnly,
    categoryId: settingCategoryIds.privateDataLifecycle,
    valueType: 'boolean',
    description: 'Reject writes against archived tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateDataLifecycleArchiveSearchable,
    categoryId: settingCategoryIds.privateDataLifecycle,
    valueType: 'boolean',
    description: 'Allow archived tickets to appear in status=ARCHIVED lists',
    isRequired: true,
    defaultValue: true,
  }),
];
