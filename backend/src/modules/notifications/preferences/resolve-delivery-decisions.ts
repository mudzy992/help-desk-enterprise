import type { PrismaService } from '../../../common/prisma/prisma.service';
import { findPreferenceCategoryForType } from './notification-preference-catalog';
import {
  decideDelivery,
  type DeliveryDecision,
  type NotificationPreferencePolicy,
  type StoredPreference,
} from './notification-preference-policy';
import type { QuietHoursWindow } from './notification-schedule-time';
import { listUsersOnCallAt } from '../../on-call/on-call-data';

type PreferenceClient = {
  readonly userNotificationPreference?: {
    findMany(args: unknown): Promise<Array<{ userId: string; inApp: boolean | null; email: string | null }>>;
  };
  readonly userNotificationSchedule?: {
    findMany(args: unknown): Promise<Array<QuietHoursWindow & { userId: string }>>;
  };
};

const allDefault: DeliveryDecision = { inApp: true, email: 'IMMEDIATE', quiet: false };

/**
 * Paket 2.2 (N8): decisions for every recipient of one event with at most two
 * queries, whatever the number of recipients. Users without rows (most) get
 * the default. Clients without the delegates (old in-memory test doubles) and
 * query failures degrade to "deliver as before".
 */
export async function resolveDeliveryDecisions(
  prisma: PrismaService,
  policy: NotificationPreferencePolicy,
  input: { readonly type: string; readonly userIds: readonly string[]; readonly now?: Date },
): Promise<ReadonlyMap<string, DeliveryDecision>> {
  const decisions = new Map<string, DeliveryDecision>();
  const entry = findPreferenceCategoryForType(input.type);
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return decisions;
  if (entry === null || entry.alwaysOn || !policy.preferencesEnabled) {
    for (const userId of userIds) decisions.set(userId, allDefault);
    return decisions;
  }
  const client = prisma as unknown as PreferenceClient;
  const now = input.now ?? new Date();
  let stored = new Map<string, StoredPreference>();
  let schedules = new Map<string, QuietHoursWindow>();
  try {
    const [preferenceRows, scheduleRows] = await Promise.all([
      client.userNotificationPreference?.findMany({
        where: { userId: { in: userIds }, category: entry.key },
        select: { userId: true, inApp: true, email: true },
      }) ?? Promise.resolve([]),
      policy.quietHoursEnabled && entry.channels.email
        ? (client.userNotificationSchedule?.findMany({
            where: { userId: { in: userIds }, quietHoursEnabled: true },
            select: {
              userId: true,
              quietHoursEnabled: true,
              quietStartMinute: true,
              quietEndMinute: true,
              quietWeekends: true,
            },
          }) ?? Promise.resolve([]))
        : Promise.resolve([]),
    ]);
    stored = new Map(preferenceRows.map((row) => [row.userId, { inApp: row.inApp, email: row.email }]));
    schedules = new Map(scheduleRows.map((row) => [row.userId, row]));
  } catch {
    // Preferences must never stop a notification.
  }
  if (schedules.size > 0) {
    // Paket 2.9 (K3, §4.3): quiet hours do not apply to whoever is on call right
    // now. Only asked when someone actually has quiet hours (one extra read).
    try {
      for (const userId of await listUsersOnCallAt(prisma, [...schedules.keys()], now)) schedules.delete(userId);
    } catch {
      // Without the on-call answer quiet hours apply as before.
    }
  }
  for (const userId of userIds) {
    decisions.set(
      userId,
      decideDelivery({ entry, policy, stored: stored.get(userId), schedule: schedules.get(userId), now }),
    );
  }
  return decisions;
}

/**
 * Option A group row: members who turned the category off in the application
 * go into `excludedUserIds` — one query that returns only those members, so the
 * group row stays one row and the read path is untouched.
 */
export async function findGroupMembersWithInAppOff(
  prisma: PrismaService,
  policy: NotificationPreferencePolicy,
  input: { readonly type: string; readonly groupId: string },
): Promise<readonly string[]> {
  const entry = findPreferenceCategoryForType(input.type);
  if (
    entry === null ||
    entry.alwaysOn ||
    !policy.preferencesEnabled ||
    policy.lockedInApp.has(entry.key)
  ) {
    return [];
  }
  const client = prisma as unknown as PreferenceClient;
  try {
    const rows =
      (await client.userNotificationPreference?.findMany({
        where: {
          category: entry.key,
          inApp: false,
          user: { groupMembers: { some: { groupId: input.groupId } } },
        },
        select: { userId: true },
      })) ?? [];
    return rows.map((row) => row.userId);
  } catch {
    return [];
  }
}
