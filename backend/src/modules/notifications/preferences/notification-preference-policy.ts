import { Logger } from '@nestjs/common';
import { notificationPreferenceSettingDefaults } from '../../settings/definitions/notification-preference-settings';
import { defaultReportsTimeZone } from '../../settings/definitions/reports-settings';
import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { parseSettingsCsv } from '../email/parse-settings-csv';
import {
  configurablePreferenceCategoryKeys,
  findPreferenceCategoryForType,
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

export class NotificationPreferencePolicyUnavailableError extends Error {
  constructor() {
    super('NOTIFICATION_PREFERENCE_POLICY_UNAVAILABLE');
    this.name = NotificationPreferencePolicyUnavailableError.name;
  }
}

export class NotificationPreferenceReadUnavailableError extends Error {
  constructor() {
    super('NOTIFICATION_PREFERENCE_READ_UNAVAILABLE');
    this.name = NotificationPreferenceReadUnavailableError.name;
    logPreferenceReadUnavailable();
  }
}

const d = notificationPreferenceSettingDefaults;
const policyLogger = new Logger('NotificationPreferencePolicy');
const policyDegradedLogIntervalMs = 60_000;
let lastPolicyDegradedLogAt = Number.NEGATIVE_INFINITY;
let lastPreferenceReadLogAt = Number.NEGATIVE_INFINITY;

/**
 * A policy can be reused for at most the settings snapshot's normal 5-second
 * convergence window. A failed read never refreshes this timestamp; after the
 * window expires optional delivery fails closed until settings are readable.
 */
export const notificationPreferencePolicyLastKnownGoodTtlMs = 5_000;
type SettingsReader = Pick<SettingsService, 'getSetting'>;
type LastKnownGoodPolicy = {
  readonly policy: NotificationPreferencePolicy;
  readonly loadedAt: number;
};
const lastKnownGoodPolicies = new WeakMap<object, LastKnownGoodPolicy>();

/** Explicitly mandatory categories may be sent without an optional policy read. */
export function requireNotificationPreferencePolicyForType(
  type: string,
  policy: NotificationPreferencePolicy | undefined,
): NotificationPreferenceCategory {
  const entry = findPreferenceCategoryForType(type);
  if (entry === null || (policy === undefined && !entry.alwaysOn)) {
    throw new NotificationPreferencePolicyUnavailableError();
  }
  return entry;
}

/**
 * Loads one complete administrator policy snapshot. A transient settings read
 * may use a recent, fully successful snapshot; it never mixes a partial read
 * with hard-coded defaults. With no fresh last-known-good policy, callers must
 * retry or fail closed rather than send a voluntary notification.
 */
export async function loadNotificationPreferencePolicy(
  settingsService: SettingsReader | undefined,
): Promise<NotificationPreferencePolicy> {
  if (settingsService === undefined) {
    logPolicyDegraded('last_known_good_unavailable');
    throw new NotificationPreferencePolicyUnavailableError();
  }
  try {
    if (typeof settingsService.getSetting !== 'function') throw new Error('SETTINGS_READ_UNAVAILABLE');
    const policy = await readCompletePolicy(settingsService);
    lastKnownGoodPolicies.set(settingsService, { policy, loadedAt: globalThis.performance.now() });
    return clonePolicy(policy);
  } catch {
    const cached = lastKnownGoodPolicies.get(settingsService);
    const age = cached === undefined ? Number.POSITIVE_INFINITY : globalThis.performance.now() - cached.loadedAt;
    if (cached !== undefined && age <= notificationPreferencePolicyLastKnownGoodTtlMs) {
      logPolicyDegraded('last_known_good_used');
      return clonePolicy(cached.policy);
    }
    logPolicyDegraded('last_known_good_unavailable');
    throw new NotificationPreferencePolicyUnavailableError();
  }
}

async function readCompletePolicy(
  settingsService: SettingsReader,
): Promise<NotificationPreferencePolicy> {
  const read = async (key: string, fallback: unknown): Promise<unknown> => {
    const value = await settingsService.getSetting(key);
    // SettingsService returns a definition's default when no row is stored. Keep
    // this fallback for test doubles and optional settings whose default is the
    // documented policy; a thrown read is handled by the all-or-nothing LKG path.
    return value === undefined ? fallback : value;
  };
  const [
    preferencesEnabled,
    lockedInApp,
    lockedEmail,
    defaultDigest,
    digestEnabled,
    digestTime,
    digestMaxItems,
    quietHoursEnabled,
    quietBypass,
    timeZone,
  ] = await Promise.all([
    read(settingKeys.privateNotificationsPreferencesEnabled, d.preferencesEnabled),
    read(settingKeys.privateNotificationsLockedInAppTypesCsv, d.lockedInApp),
    read(settingKeys.privateNotificationsLockedEmailTypesCsv, d.lockedEmail),
    read(settingKeys.privateNotificationsDefaultsDigestTypesCsv, d.digestTypes),
    read(settingKeys.privateNotificationsDigestEnabled, d.digestEnabled),
    read(settingKeys.privateNotificationsDigestDefaultTime, d.digestDefaultTime),
    read(settingKeys.privateNotificationsDigestMaxItems, d.digestMaxItems.default),
    read(settingKeys.privateNotificationsQuietHoursEnabled, d.quietHoursEnabled),
    read(settingKeys.privateNotificationsQuietHoursBypassTypesCsv, d.quietBypass),
    read(settingKeys.privateReportsTimeZone, defaultReportsTimeZone),
  ]);
  const digestMinute =
    typeof digestTime === 'string' ? parseClockMinute(digestTime, -1) : -1;
  if (
    typeof preferencesEnabled !== 'boolean' ||
    typeof digestEnabled !== 'boolean' ||
    typeof quietHoursEnabled !== 'boolean' ||
    digestMinute < 0 ||
    !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/u.test(String(digestTime)) ||
    typeof digestMaxItems !== 'number' ||
    !Number.isInteger(digestMaxItems) ||
    digestMaxItems < d.digestMaxItems.min ||
    digestMaxItems > d.digestMaxItems.max ||
    typeof timeZone !== 'string' ||
    !isValidTimeZone(timeZone)
  ) {
    throw new Error('INVALID_NOTIFICATION_PREFERENCE_POLICY');
  }
  return {
    preferencesEnabled,
    lockedInApp: parseCategorySet(lockedInApp),
    lockedEmail: parseCategorySet(lockedEmail),
    defaultDigest: parseCategorySet(defaultDigest),
    digestEnabled,
    digestDefaultMinute: digestMinute,
    digestMaxItems,
    quietHoursEnabled,
    quietBypass: parseCategorySet(quietBypass),
    timeZone: timeZone.trim(),
  };
}

function parseCategorySet(value: unknown): ReadonlySet<string> {
  if (typeof value !== 'string') throw new Error('INVALID_NOTIFICATION_PREFERENCE_CATEGORY_SET');
  const parsed = parseSettingsCsv(value);
  const allowed = new Set(configurablePreferenceCategoryKeys);
  if (parsed.some((key) => !allowed.has(key))) {
    throw new Error('INVALID_NOTIFICATION_PREFERENCE_CATEGORY_SET');
  }
  return new Set(parsed);
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(new Date());
    return value.trim().length > 0;
  } catch {
    return false;
  }
}

function clonePolicy(policy: NotificationPreferencePolicy): NotificationPreferencePolicy {
  return {
    ...policy,
    lockedInApp: new Set(policy.lockedInApp),
    lockedEmail: new Set(policy.lockedEmail),
    defaultDigest: new Set(policy.defaultDigest),
    quietBypass: new Set(policy.quietBypass),
  };
}

function logPolicyDegraded(reason: 'last_known_good_used' | 'last_known_good_unavailable'): void {
  const now = Date.now();
  if (now - lastPolicyDegradedLogAt < policyDegradedLogIntervalMs) return;
  lastPolicyDegradedLogAt = now;
  policyLogger.warn(`notification_preference_policy_degraded reason=${reason}`);
}

function logPreferenceReadUnavailable(): void {
  const now = Date.now();
  if (now - lastPreferenceReadLogAt < policyDegradedLogIntervalMs) return;
  lastPreferenceReadLogAt = now;
  policyLogger.warn('notification_preference_read_unavailable');
}

export const defaultNotificationPreferencePolicy: NotificationPreferencePolicy = {
  preferencesEnabled: d.preferencesEnabled,
  lockedInApp: new Set(parseSettingsCsv(d.lockedInApp)),
  lockedEmail: new Set(parseSettingsCsv(d.lockedEmail)),
  defaultDigest: new Set(parseSettingsCsv(d.digestTypes)),
  digestEnabled: d.digestEnabled,
  digestDefaultMinute: parseClockMinute(d.digestDefaultTime, 450),
  digestMaxItems: d.digestMaxItems.default,
  quietHoursEnabled: d.quietHoursEnabled,
  quietBypass: new Set(parseSettingsCsv(d.quietBypass)),
  timeZone: defaultReportsTimeZone,
};

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
