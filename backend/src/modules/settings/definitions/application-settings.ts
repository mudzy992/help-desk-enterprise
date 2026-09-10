import type { SettingDefinition } from '../settings.types';
import { directorySyncSettings } from './directory-sync-settings';
import { foundationalSettings } from './foundational-settings';
import { readOnlyModeSettings } from './read-only-mode-settings';
import { serviceAvailabilitySettings } from './service-availability-settings';
import { serviceFormsSettings } from './service-forms-settings';
import { serviceLifecycleSettings } from './service-lifecycle-settings';

export const applicationSettings: readonly SettingDefinition[] = [
  ...foundationalSettings,
  ...directorySyncSettings,
  ...readOnlyModeSettings,
  ...serviceLifecycleSettings,
  ...serviceAvailabilitySettings,
  ...serviceFormsSettings,
];
