/**
 * Phase 2.3 (plan §2.3, item 2): the notification table is the fastest growing
 * one in the schema, and nothing ever removed a row from it.
 *
 * Ninety days is the documented default (an operator can shorten or lengthen it
 * with `NOTIFICATION_RETENTION_DAYS`), the delete runs in bounded batches so it
 * never holds a long transaction, and the schedule is a daily worker job.
 */
export const notificationRetentionDaysDefault = 90;

export const notificationRetentionBatchSize = 5000;

export const notificationRetentionQueueName = 'notification-retention';
export const notificationRetentionJobName = 'purge-expired-notifications';
export const notificationRetentionSchedulerId = 'notification-retention-daily';
/** 03:30 UTC — a quiet hour for every deployment timezone we run in. */
export const notificationRetentionCronPattern = '30 3 * * *';
export const notificationRetentionJobAttempts = 2;
export const notificationRetentionJobBackoffMilliseconds = 30_000;

export function resolveNotificationRetentionDays(
  raw: string | undefined = process.env.NOTIFICATION_RETENTION_DAYS,
): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return notificationRetentionDaysDefault;
  }
  return parsed;
}
