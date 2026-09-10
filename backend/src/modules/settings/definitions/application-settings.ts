import type { SettingDefinition } from '../settings.types';
import { directorySyncSettings } from './directory-sync-settings';
import { foundationalSettings } from './foundational-settings';

export const applicationSettings: readonly SettingDefinition[] = [
  ...foundationalSettings,
  ...directorySyncSettings,
];
