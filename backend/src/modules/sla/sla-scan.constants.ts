/**
 * Phase 2.1 (plan §2.1): the SLA scan runs in the worker process as a BullMQ
 * scheduled job instead of an `@Interval` inside the API process.
 *
 * The scheduler is idempotent (one entry per id), so starting a second worker
 * instance does not duplicate it, and BullMQ only hands a due job to one worker
 * at a time — that is the distributed lock the plan asks for.
 */
export const slaScanQueueName = 'sla-scan';
export const slaScanJobName = 'scan-due-sla-states';
export const slaScanSchedulerId = 'sla-scan-every-minute';
export const slaScanRepeatEveryMilliseconds = 60 * 1000;
export const slaScanJobAttempts = 2;
export const slaScanJobBackoffMilliseconds = 5_000;
export const slaScanCompletedJobsToKeep = 20;
export const slaScanFailedJobsToKeep = 50;
