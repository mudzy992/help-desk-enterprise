import { notificationPreferenceSettingDefaults } from '../../settings/definitions/notification-preference-settings';
import { readInstallationTimeZone } from '../../settings/read-installation-time-zone';
import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { parseSettingsCsv } from '../email/parse-settings-csv';
import {
  type NotificationEmailMode,
  type NotificationPreferenceCategory,
} from './notification-preference-catalog';
import { isInQuietHours, parseClockMinute, type QuietHoursWindow } from './notification-schedule-time';

/** Paket 2.2 (N4/N7): the administrator side of every delivery decision. */
export type NotificationPreferencePolicy = {
  readonly preferencesEnabled: boolean;
  readonly lockedInApp: ReadonlySet<string>;
  readonly lockedEmail: ReadonlySet<string>;
  readonly defaultDigest: ReadonlySet<string>;
  readonly digestEnabled: boolean;
  readonly digestDefaultMinute: number;
  readonly digestMaxItems: number;
  readonly quietHoursEnabled: boolean;
  readonly quietBypass: ReadonlySet<string>;
  readonly timeZone: string;
};

const d = notificationPreferenceSettingDefaults;

export const defaultNotificationPreferencePolicy: NotificationPreferencePolicy = {
  preferencesEnabled: true,
  lockedInApp: new Set(parseSettingsCsv(d.lockedInApp)),
  lockedEmail: new Set(parseSettingsCsv(d.lockedEmail)),
  defaultDigest: new Set(),
  digestEnabled: true,
  digestDefaultMinute: parseClockMinute(d.digestDefaultTime, 450),
  digestMaxItems: d.digestMaxItems.default,
  quietHoursEnabled: true,
  quietBypass: new Set(parseSettingsCsv(d.quietBypass)),
  timeZone: 'Europe/Sarajevo',
};

type SettingsReader = Pick<SettingsService, 'getSetting'>;

/** Settings come from the shared snapshot (no query per event); failures → defaults. */
export async function loadNotificationPreferencePolicy(
  settingsService: SettingsReader | undefined,
): Promise<NotificationPreferencePolicy> {
  if (settingsService === undefined) return defaultNotificationPreferencePolicy;
  const read = async (key: string): Promise<unknown> => {
    try {
      return await settingsService.getSetting(key);
    } catch {
      return undefined;
    }
  };
  const [enabled, lockedInApp, lockedEmail, digestTypes, digestEnabled, digestTime, maxItems, quiet, bypass] =
    await Promise.all([
      read(settingKeys.privateNotificationsPreferencesEnabled),
      read(settingKeys.privateNotificationsLockedInAppTypesCsv),
      read(settingKeys.privateNotificationsLockedEmailTypesCsv),
      read(settingKeys.privateNotificationsDefaultsDigestTypesCsv),
      read(settingKeys.privateNotificationsDigestEnabled),
      read(settingKeys.privateNotificationsDigestDefaultTime),
      read(settingKeys.privateNotificationsDigestMaxItems),
      read(settingKeys.privateNotificationsQuietHoursEnabled),
      read(settingKeys.privateNotificationsQuietHoursBypassTypesCsv),
    ]);
  const base = defaultNotificationPreferencePolicy;
  const csv = (value: unknown, fallback: ReadonlySet<string>) =>
    typeof value === 'string' ? new Set(parseSettingsCsv(value)) : fallback;
  return {
    preferencesEnabled: typeof enabled === 'boolean' ? enabled : base.preferencesEnabled,
    lockedInApp: csv(lockedInApp, base.lockedInApp),
    lockedEmail: csv(lockedEmail, base.lockedEmail),
    defaultDigest: csv(digestTypes, base.defaultDigest),
    digestEnabled: typeof digestEnabled === 'boolean' ? digestEnabled : base.digestEnabled,
    digestDefaultMinute:
      typeof digestTime === 'string' ? parseClockMinute(digestTime, base.digestDefaultMinute) : base.digestDefaultMinute,
    digestMaxItems: typeof maxItems === 'number' && Number.isInteger(maxItems) ? maxItems : base.digestMaxItems,
    quietHoursEnabled: typeof quiet === 'boolean' ? quiet : base.quietHoursEnabled,
    quietBypass: csv(bypass, base.quietBypass),
    timeZone: await readInstallationTimeZone(settingsService as SettingsService),
  };
}

export type StoredPreference = {
  readonly inApp: boolean | null;
  readonly email: string | null;
};

export type DeliveryEmailDecision = 'IMMEDIATE' | 'DIGEST' | 'QUIET' | 'OFF';

export type DeliveryDecision = {
  readonly inApp: boolean;
  readonly email: DeliveryEmailDecision;
  /** In quiet hours right now (Edge desktop pop-ups are skipped). */
  readonly quiet: boolean;
};

export function defaultEmailMode(
  entry: NotificationPreferenceCategory,
  policy: NotificationPreferencePolicy,
): NotificationEmailMode {
  return policy.defaultDigest.has(entry.key) ? 'DIGEST' : 'IMMEDIATE';
}

export type EffectivePreference = {
  readonly inApp: boolean;
  readonly email: NotificationEmailMode;
  readonly inAppLocked: boolean;
  readonly emailLocked: boolean;
};

/** What the user sees on the profile page: choice after locks and defaults. */
export function effectivePreference(
  entry: NotificationPreferenceCategory,
  policy: NotificationPreferencePolicy,
  stored: StoredPreference | undefined,
): EffectivePreference {
  const inAppLocked = entry.alwaysOn || policy.lockedInApp.has(entry.key);
  const emailLocked = entry.alwaysOn || policy.lockedEmail.has(entry.key);
  const useStored = policy.preferencesEnabled && stored !== undefined;
  const inApp = inAppLocked ? true : useStored && stored.inApp !== null ? stored.inApp : true;
  let email: NotificationEmailMode = defaultEmailMode(entry, policy);
  if (emailLocked) {
    email = 'IMMEDIATE';
  } else if (useStored && isEmailMode(stored.email)) {
    email = stored.email;
  }
  if (email === 'DIGEST' && !policy.digestEnabled) email = 'IMMEDIATE';
  return { inApp, email, inAppLocked, emailLocked };
}

/** N8: the decision for one recipient of one event. */
export function decideDelivery(input: {
  readonly entry: NotificationPreferenceCategory | null;
  readonly policy: NotificationPreferencePolicy;
  readonly stored: StoredPreference | undefined;
  readonly schedule: QuietHoursWindow | undefined;
  readonly now: Date;
}): DeliveryDecision {
  const { entry, policy } = input;
  if (entry === null || entry.alwaysOn) {
    return { inApp: true, email: 'IMMEDIATE', quiet: false };
  }
  const effective = effectivePreference(entry, policy, input.stored);
  const quiet =
    policy.preferencesEnabled &&
    policy.quietHoursEnabled &&
    input.schedule !== undefined &&
    isInQuietHours(input.schedule, input.now, policy.timeZone);
  let email: DeliveryEmailDecision = effective.email;
  if (email === 'IMMEDIATE' && quiet && !effective.emailLocked && !policy.quietBypass.has(entry.key)) {
    email = 'QUIET';
  }
  return { inApp: effective.inApp, email, quiet };
}

export function isEmailMode(value: unknown): value is NotificationEmailMode {
  return value === 'IMMEDIATE' || value === 'DIGEST' || value === 'OFF';
}
