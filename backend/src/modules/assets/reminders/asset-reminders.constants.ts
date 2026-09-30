/** Paket 3.2 (§10): expiry reminders for warranties, contracts and licences. */
export const assetRemindersQueueName = 'asset-reminders';
export const assetRemindersJobName = 'asset-reminders-sweep';
export const assetRemindersSchedulerId = 'asset-reminders-hourly';
/**
 * Hourly; the run only acts from 06:00 local time (installation time zone),
 * so the reminders arrive in the morning and a missed hour catches up. The
 * `remindersSent` arrays make every run idempotent.
 */
export const assetRemindersCronPattern = '7 * * * *';
export const assetRemindersLocalStartHour = 6;
export const assetRemindersJobAttempts = 2;
export const assetRemindersJobBackoffMilliseconds = 60_000;
/** Recipients per run; more means the permission is granted too widely. */
export const assetRemindersMaxRecipients = 100;
export const assetRemindersMaxItems = 2000;
