import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { loadEmailChannelConfiguration } from '../email/load-email-channel-configuration';
import {
  categoriesForRoleRank,
  findPreferenceCategory,
  type NotificationEmailMode,
  type NotificationRoleRank,
} from './notification-preference-catalog';
import {
  defaultEmailMode,
  effectivePreference,
  isEmailMode,
  loadNotificationPreferencePolicy,
  type NotificationPreferencePolicy,
} from './notification-preference-policy';
import { nextDigestSlot } from './notification-schedule-time';

export type NotificationPreferenceCategoryView = {
  readonly key: string;
  readonly channels: { readonly inApp: boolean; readonly email: boolean };
  readonly alwaysOn: boolean;
  readonly inApp: boolean;
  readonly email: NotificationEmailMode;
  readonly inAppLocked: boolean;
  readonly emailLocked: boolean;
  readonly customized: boolean;
  readonly defaults: { readonly inApp: boolean; readonly email: NotificationEmailMode };
};

export type NotificationScheduleView = {
  readonly quietHoursEnabled: boolean;
  readonly quietStart: string;
  readonly quietEnd: string;
  readonly quietWeekends: boolean;
  /** null = administrator default */
  readonly digestTime: string | null;
  readonly digestWorkdaysOnly: boolean;
};

export type NotificationPreferencesView = {
  readonly categories: readonly NotificationPreferenceCategoryView[];
  readonly schedule: NotificationScheduleView;
  readonly policy: {
    readonly preferencesEnabled: boolean;
    readonly digestEnabled: boolean;
    readonly quietHoursEnabled: boolean;
    readonly digestDefaultTime: string;
    readonly timeZone: string;
    readonly emailChannelAvailable: boolean;
  };
  readonly digest: { readonly nextAt: string | null; readonly pendingItems: number };
};

export type NotificationPreferencesSummary = {
  readonly customizedCategories: number;
  readonly quietHours: { readonly start: string; readonly end: string; readonly weekends: boolean } | null;
  readonly digestTime: string | null;
  readonly pendingItems: number;
};

export type NotificationPreferenceUpdate = {
  readonly preferences?: readonly {
    readonly category: string;
    readonly inApp?: boolean | null;
    readonly email?: string | null;
  }[];
  readonly schedule?: {
    readonly quietHoursEnabled?: boolean;
    readonly quietStart?: string;
    readonly quietEnd?: string;
    readonly quietWeekends?: boolean;
    readonly digestTime?: string | null;
    readonly digestWorkdaysOnly?: boolean;
  };
};

export class NotificationPreferencesError extends Error {
  constructor(
    readonly code: 'NOTIFICATION_PREFERENCES_DISABLED' | 'NOTIFICATION_PREFERENCES_INVALID',
    readonly details: readonly string[] = [],
  ) {
    super(code);
  }
}

const defaultSchedule = {
  quietHoursEnabled: false,
  quietStartMinute: 1080,
  quietEndMinute: 420,
  quietWeekends: false,
  digestMinute: null as number | null,
  digestWorkdaysOnly: true,
};

const quarterClock = /^([01]\d|2[0-3]):(00|15|30|45)$/;

export function formatClockMinute(minute: number): string {
  const safe = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function parseQuarterClock(value: string): number | null {
  const match = quarterClock.exec(value);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/** Paket 2.2 (N9/N10): read and write of the caller's own preferences. */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async view(userId: string, roleRank: NotificationRoleRank, now = new Date()): Promise<NotificationPreferencesView> {
    const policy = await loadNotificationPreferencePolicy(this.settingsService);
    const [rows, scheduleRow, pendingItems, emailConfiguration] = await Promise.all([
      this.prisma.userNotificationPreference.findMany({ where: { userId } }),
      this.prisma.userNotificationSchedule.findUnique({ where: { userId } }),
      this.prisma.notificationDigestItem.count({ where: { userId } }),
      loadEmailChannelConfiguration(this.settingsService),
    ]);
    const stored = new Map(rows.map((row) => [row.category, row]));
    const categories = categoriesForRoleRank(roleRank).map((entry): NotificationPreferenceCategoryView => {
      const row = stored.get(entry.key);
      const effective = effectivePreference(entry, policy, row);
      return {
        key: entry.key,
        channels: entry.channels,
        alwaysOn: entry.alwaysOn,
        inApp: effective.inApp,
        email: entry.channels.email ? effective.email : 'OFF',
        inAppLocked: effective.inAppLocked,
        emailLocked: effective.emailLocked,
        customized: row !== undefined && (row.inApp !== null || row.email !== null),
        defaults: { inApp: true, email: entry.channels.email ? defaultEmailMode(entry, policy) : 'OFF' },
      };
    });
    const schedule = scheduleRow ?? { ...defaultSchedule };
    const digestMinute = schedule.digestMinute ?? policy.digestDefaultMinute;
    const next = nextDigestSlot(now, policy.timeZone, digestMinute, schedule.digestWorkdaysOnly);
    return {
      categories,
      schedule: {
        quietHoursEnabled: schedule.quietHoursEnabled,
        quietStart: formatClockMinute(schedule.quietStartMinute),
        quietEnd: formatClockMinute(schedule.quietEndMinute),
        quietWeekends: schedule.quietWeekends,
        digestTime: schedule.digestMinute === null ? null : formatClockMinute(schedule.digestMinute),
        digestWorkdaysOnly: schedule.digestWorkdaysOnly,
      },
      policy: {
        preferencesEnabled: policy.preferencesEnabled,
        digestEnabled: policy.digestEnabled,
        quietHoursEnabled: policy.quietHoursEnabled,
        digestDefaultTime: formatClockMinute(policy.digestDefaultMinute),
        timeZone: policy.timeZone,
        emailChannelAvailable: emailConfiguration.deliveryEnabled && emailConfiguration.smtp !== null,
      },
      digest: { nextAt: policy.digestEnabled ? (next?.toISOString() ?? null) : null, pendingItems },
    };
  }

  async update(userId: string, roleRank: NotificationRoleRank, input: NotificationPreferenceUpdate): Promise<void> {
    const policy = await loadNotificationPreferencePolicy(this.settingsService);
    if (!policy.preferencesEnabled) {
      throw new NotificationPreferencesError('NOTIFICATION_PREFERENCES_DISABLED');
    }
    const plan = validatePreferenceUpdate(input, roleRank, policy);
    await this.prisma.$transaction(async (transaction) => {
      for (const change of plan.preferences) {
        if (change.inApp === null && change.email === null) {
          await transaction.userNotificationPreference.deleteMany({ where: { userId, category: change.category } });
        } else {
          await transaction.userNotificationPreference.upsert({
            where: { userId_category: { userId, category: change.category } },
            create: { userId, category: change.category, inApp: change.inApp, email: change.email },
            update: { inApp: change.inApp, email: change.email },
          });
        }
      }
      if (plan.schedule !== null) {
        await transaction.userNotificationSchedule.upsert({
          where: { userId },
          create: { userId, ...plan.schedule },
          update: plan.schedule,
        });
      }
    });
  }

  async reset(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userNotificationPreference.deleteMany({ where: { userId } }),
      this.prisma.userNotificationSchedule.updateMany({
        where: { userId },
        data: {
          quietHoursEnabled: defaultSchedule.quietHoursEnabled,
          quietStartMinute: defaultSchedule.quietStartMinute,
          quietEndMinute: defaultSchedule.quietEndMinute,
          quietWeekends: defaultSchedule.quietWeekends,
          digestMinute: null,
          digestWorkdaysOnly: defaultSchedule.digestWorkdaysOnly,
        },
      }),
    ]);
  }

  async summary(userId: string): Promise<NotificationPreferencesSummary> {
    const [rows, schedule, pendingItems] = await Promise.all([
      this.prisma.userNotificationPreference.findMany({ where: { userId }, select: { inApp: true, email: true } }),
      this.prisma.userNotificationSchedule.findUnique({ where: { userId } }),
      this.prisma.notificationDigestItem.count({ where: { userId } }),
    ]);
    return {
      customizedCategories: rows.filter((row) => row.inApp !== null || row.email !== null).length,
      quietHours:
        schedule?.quietHoursEnabled === true
          ? {
              start: formatClockMinute(schedule.quietStartMinute),
              end: formatClockMinute(schedule.quietEndMinute),
              weekends: schedule.quietWeekends,
            }
          : null,
      digestTime: schedule?.digestMinute == null ? null : formatClockMinute(schedule.digestMinute),
      pendingItems,
    };
  }
}

type ScheduleWrite = {
  quietHoursEnabled?: boolean;
  quietStartMinute?: number;
  quietEndMinute?: number;
  quietWeekends?: boolean;
  digestMinute?: number | null;
  digestWorkdaysOnly?: boolean;
};

/**
 * N10: every problem is collected and reported at once; nothing is written when
 * one entry is wrong. A value equal to the default is stored as `null` so an
 * administrator's later default change applies to this user too (N3).
 */
export function validatePreferenceUpdate(
  input: NotificationPreferenceUpdate,
  roleRank: NotificationRoleRank,
  policy: NotificationPreferencePolicy,
): {
  readonly preferences: { category: string; inApp: boolean | null; email: NotificationEmailMode | null }[];
  readonly schedule: ScheduleWrite | null;
} {
  const errors: string[] = [];
  const preferences: { category: string; inApp: boolean | null; email: NotificationEmailMode | null }[] = [];
  const seen = new Set<string>();
  for (const change of input.preferences ?? []) {
    const entry = findPreferenceCategory(change.category);
    if (entry === null) {
      errors.push(`${change.category}: unknown category`);
      continue;
    }
    if (seen.has(entry.key)) {
      errors.push(`${entry.key}: listed twice`);
      continue;
    }
    seen.add(entry.key);
    if (entry.minRoleRank > roleRank) {
      errors.push(`${entry.key}: not available for your role`);
      continue;
    }
    if (entry.alwaysOn) {
      errors.push(`${entry.key}: always on`);
      continue;
    }
    let inApp: boolean | null = null;
    if (change.inApp !== undefined && change.inApp !== null) {
      if (policy.lockedInApp.has(entry.key) && change.inApp === false) {
        errors.push(`${entry.key}: in-app is locked by the administrator`);
      } else {
        inApp = change.inApp === true ? null : false;
      }
    }
    let email: NotificationEmailMode | null = null;
    if (change.email !== undefined && change.email !== null) {
      if (!isEmailMode(change.email)) {
        errors.push(`${entry.key}: invalid e-mail mode ${String(change.email)}`);
      } else if (!entry.channels.email) {
        errors.push(`${entry.key}: has no e-mail channel`);
      } else if (policy.lockedEmail.has(entry.key) && change.email !== 'IMMEDIATE') {
        errors.push(`${entry.key}: e-mail is locked by the administrator`);
      } else {
        email = change.email === defaultEmailMode(entry, policy) ? null : change.email;
      }
    }
    preferences.push({ category: entry.key, inApp, email });
  }
  let schedule: ScheduleWrite | null = null;
  if (input.schedule !== undefined) {
    const source = input.schedule;
    const write: ScheduleWrite = {};
    if (source.quietHoursEnabled !== undefined) {
      if (source.quietHoursEnabled && !policy.quietHoursEnabled) {
        errors.push('schedule.quietHoursEnabled: quiet hours are disabled by the administrator');
      } else {
        write.quietHoursEnabled = source.quietHoursEnabled;
      }
    }
    for (const [field, target] of [
      ['quietStart', 'quietStartMinute'],
      ['quietEnd', 'quietEndMinute'],
    ] as const) {
      const value = source[field];
      if (value === undefined) continue;
      const minute = parseQuarterClock(value);
      if (minute === null) errors.push(`schedule.${field}: expected HH:MM in 15-minute steps`);
      else write[target] = minute;
    }
    if (source.quietWeekends !== undefined) write.quietWeekends = source.quietWeekends;
    if (source.digestTime !== undefined) {
      if (source.digestTime === null) {
        write.digestMinute = null;
      } else {
        const minute = parseQuarterClock(source.digestTime);
        if (minute === null) errors.push('schedule.digestTime: expected HH:MM in 15-minute steps');
        else write.digestMinute = minute === policy.digestDefaultMinute ? null : minute;
      }
    }
    if (source.digestWorkdaysOnly !== undefined) write.digestWorkdaysOnly = source.digestWorkdaysOnly;
    schedule = Object.keys(write).length === 0 ? null : write;
  }
  if (errors.length > 0) {
    throw new NotificationPreferencesError('NOTIFICATION_PREFERENCES_INVALID', errors);
  }
  return { preferences, schedule };
}
