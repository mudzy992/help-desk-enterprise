/** Paket 2.2 (N5/§5): the digest / quiet-hours pass, every 5 minutes in the worker. */
export const notificationDigestQueueName = 'notification-digest';
export const notificationDigestJobName = 'send-due-digests';
export const notificationDigestSchedulerId = 'notification-digest-5min';
export const notificationDigestCronPattern = '*/5 * * * *';
/** Users handled per pass; the rest follow five minutes later. */
export const notificationDigestUsersPerRun = 500;
/** Held items read per user (the e-mail lists at most `digest.maxItems` tickets). */
export const notificationDigestItemsPerUser = 1000;
/** N11: held items older than this are dropped (e.g. SMTP off for a week). */
export const notificationDigestItemRetentionDays = 7;
