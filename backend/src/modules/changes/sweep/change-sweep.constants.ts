/** Paket 3.4 (§14): start reminders and overrun warnings, every 15 minutes. */
export const changeSweepQueueName = 'change-sweep';
export const changeSweepJobName = 'change-sweep-run';
export const changeSweepSchedulerId = 'change-sweep-quarter-hourly';
export const changeSweepCronPattern = '*/15 * * * *';
export const changeSweepJobAttempts = 2;
export const changeSweepJobBackoffMilliseconds = 60_000;
export const changeSweepBatch = 200;
