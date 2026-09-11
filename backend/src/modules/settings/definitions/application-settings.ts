import type { SettingDefinition } from '../settings.types';
import { addonSettings } from './addon-settings';
import { directorySyncSettings } from './directory-sync-settings';
import { foundationalSettings } from './foundational-settings';
import { readOnlyModeSettings } from './read-only-mode-settings';
import { serviceAvailabilitySettings } from './service-availability-settings';
import { serviceFormsSettings } from './service-forms-settings';
import { serviceLifecycleSettings } from './service-lifecycle-settings';
import { serviceOnboardingSettings } from './service-onboarding-settings';
import { changeLogSettings } from './change-log-settings';
import { smtpSettings } from './smtp-settings';
import { ticketRoutingSettings } from './ticket-routing-settings';

export const applicationSettings: readonly SettingDefinition[] = [
  ...foundationalSettings,
  ...directorySyncSettings,
  ...readOnlyModeSettings,
  ...serviceLifecycleSettings,
  ...serviceAvailabilitySettings,
  ...serviceFormsSettings,
  ...serviceOnboardingSettings,
  ...ticketRoutingSettings,
  ...changeLogSettings,
  ...smtpSettings,
  ...addonSettings,
];
