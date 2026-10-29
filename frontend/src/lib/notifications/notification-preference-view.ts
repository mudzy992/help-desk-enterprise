import type {
  NotificationEmailMode,
  NotificationPreferenceCategoryKey,
} from "@/services/notification-preferences-api";

type ReplaceDots<S extends string> = S extends `${infer Head}.${infer Tail}`
  ? `${Head}_${ReplaceDots<Tail>}`
  : S;

type CategoryLabelKey =
  `account.notifications.categories.${ReplaceDots<NotificationPreferenceCategoryKey>}`;

export const notificationEmailModes: readonly NotificationEmailMode[] = [
  "IMMEDIATE",
  "DIGEST",
  "OFF",
];

export const notificationCategoryLabel = (key: NotificationPreferenceCategoryKey) =>
  `account.notifications.categories.${key.replace(/\./g, "_")}` as CategoryLabelKey;
