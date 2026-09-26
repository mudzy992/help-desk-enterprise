import { apiRequest } from "@/services/api";

/* Paket 2.2: personal notification preferences ("Moje notifikacije"). */

export const notificationPreferenceCategoryKeys = [
  "ticket.created",
  "ticket.assigned",
  "ticket.forwarded",
  "ticket.message",
  "ticket.outcome",
  "ticket.approval",
  "ticket.sla",
  "remote.requested",
  "ticket.timeAutoStopped",
  "ticket.unrouted",
  "knowledge.reviewDue",
  "directory.syncAborted",
  "account.security",
] as const;
export type NotificationPreferenceCategoryKey = (typeof notificationPreferenceCategoryKeys)[number];

export type NotificationEmailMode = "IMMEDIATE" | "DIGEST" | "OFF";

export type NotificationPreferenceCategory = {
  readonly key: NotificationPreferenceCategoryKey;
  readonly channels: { readonly inApp: boolean; readonly email: boolean };
  readonly alwaysOn: boolean;
  readonly inApp: boolean;
  readonly email: NotificationEmailMode;
  readonly inAppLocked: boolean;
  readonly emailLocked: boolean;
  readonly customized: boolean;
  readonly defaults: { readonly inApp: boolean; readonly email: NotificationEmailMode };
};

export type NotificationSchedule = {
  readonly quietHoursEnabled: boolean;
  readonly quietStart: string;
  readonly quietEnd: string;
  readonly quietWeekends: boolean;
  readonly digestTime: string | null;
  readonly digestWorkdaysOnly: boolean;
};

export type NotificationPreferences = {
  readonly categories: readonly NotificationPreferenceCategory[];
  readonly schedule: NotificationSchedule;
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

export type NotificationPreferencesUpdate = {
  readonly preferences?: readonly {
    readonly category: string;
    readonly inApp?: boolean;
    readonly email?: NotificationEmailMode;
  }[];
  readonly schedule?: Partial<NotificationSchedule>;
};

export type NotificationPreferencesSummary = {
  readonly customizedCategories: number;
  readonly quietHours: { readonly start: string; readonly end: string; readonly weekends: boolean } | null;
  readonly digestTime: string | null;
  readonly pendingItems: number;
};

const path = "/users/me/notification-preferences";
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const getNotificationPreferences = (): Promise<NotificationPreferences> => apiRequest(path);

export const updateNotificationPreferences = (input: NotificationPreferencesUpdate): Promise<NotificationPreferences> =>
  apiRequest(path, json("PUT", input));

export const resetNotificationPreferences = (): Promise<NotificationPreferences> => apiRequest(path, json("DELETE"));

export const sendTestDigest = (): Promise<{ sent: true }> => apiRequest(`${path}/test-digest`, json("POST"));

export const getUserNotificationPreferences = (userId: string): Promise<NotificationPreferencesSummary> =>
  apiRequest(`/users/${encodeURIComponent(userId)}/notification-preferences`);

export const resetUserNotificationPreferences = (userId: string): Promise<void> =>
  apiRequest(`/users/${encodeURIComponent(userId)}/notification-preferences`, json("DELETE"));

/** Quarter-hour clock values offered by the time pickers (backend accepts only these). */
export const quarterHourOptions: readonly string[] = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** Builds the minimal PUT body: only rows and schedule fields that differ from the server copy. */
export function diffNotificationPreferences(
  saved: NotificationPreferences,
  draft: NotificationPreferences,
): NotificationPreferencesUpdate {
  const savedByKey = new Map(saved.categories.map((category) => [category.key, category]));
  const preferences = draft.categories.flatMap((category) => {
    const before = savedByKey.get(category.key);
    if (before === undefined || category.alwaysOn) return [];
    const change: { category: string; inApp?: boolean; email?: NotificationEmailMode } = { category: category.key };
    if (before.inApp !== category.inApp && !category.inAppLocked) change.inApp = category.inApp;
    if (before.email !== category.email && !category.emailLocked && category.channels.email) change.email = category.email;
    return Object.keys(change).length > 1 ? [change] : [];
  });
  const schedule: Record<string, unknown> = {};
  for (const field of Object.keys(draft.schedule) as (keyof NotificationSchedule)[]) {
    if (draft.schedule[field] !== saved.schedule[field]) schedule[field] = draft.schedule[field];
  }
  return {
    ...(preferences.length > 0 ? { preferences } : {}),
    ...(Object.keys(schedule).length > 0 ? { schedule: schedule as Partial<NotificationSchedule> } : {}),
  };
}
