import { createHash } from 'node:crypto';

/** Paket 2.5 (§5): scheduled e-mail reports. */

export const reportScheduleFrequencies = ['WEEKLY', 'MONTHLY'] as const;
export type ReportScheduleFrequency = (typeof reportScheduleFrequencies)[number];

/** HTML sections of the e-mail, in the order they are rendered. */
export const reportScheduleSections = ['kpi', 'trend', 'topServices', 'overdue'] as const;
export type ReportScheduleSection = (typeof reportScheduleSections)[number];

export const reportScheduleNameMaxLength = 120;
/** Buckets of the „trend” section (12 weeks / 12 months). */
export const reportScheduleTrendBuckets = 12;
/** Rows of the „top services” and „overdue” sections. */
export const reportScheduleTopRows = 10;

export const reportScheduleLimits = {
  /** Due schedules handled per sweep; the rest follow five minutes later. */
  schedulesPerSweep: 20,
  /** A RUNNING run older than this is taken over (worker crashed mid-send). */
  staleRunMs: 15 * 60_000,
  /** Run log retention (design §5.3). */
  runRetentionDays: 180,
  /** „Historija izvršenja” shows this many runs. */
  runsListed: 50,
  /** Candidate search returns at most this many users. */
  candidatesListed: 20,
  /** All CSV attachments of one e-mail together (design §5.2). */
  attachmentsMaxBytes: 10 * 1024 * 1024,
} as const;

/**
 * W7.103 (`BA-reports-14`): the retention delete is batched and bounded. One `deleteMany` over the whole backlog
 * held a long lock and wrote one huge WAL burst; a batch keeps the prune short, and the sweep continues where the
 * last pass stopped.
 */
export const reportScheduleRunRetentionBatchSize = 500;
/** Batches per pass; a backlog larger than 20 000 rows is finished by the next sweep (`remaining: true`). */
export const reportScheduleRunRetentionMaxBatches = 40;

export const reportSchedulesQueueName = 'report-schedules';
export const reportSchedulesSweepJobName = 'sweep-due-schedules';
export const reportSchedulesManualJobName = 'run-schedule-now';
/**
 * W7.106 (`BA-reports-16`): namespace of the „send now” command in `IdempotencyRecord`. The client's
 * `Idempotency-Key` is unique *per namespace*, so it cannot collide with a ticket command that happens to use the
 * same value.
 */
export const reportSchedulesRunNowNamespace = 'report.schedule.run-now';
/** Same shape `RequestIdempotencyService` accepts; validated here so a bad header is a 400, not a 500. */
export const reportSchedulesIdempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

/**
 * W7.106 (`BA-reports-16`): a deterministic BullMQ job id for a „send now” command. BullMQ uses `:` as its key
 * separator and refuses ids that contain one, while a client's `Idempotency-Key` may contain it — so the id is a
 * hash of the key. The job id is only the cheap dedupe; the unique `ReportScheduleRun.commandKey` is the guarantee.
 */
export function reportScheduleManualJobId(commandKey: string): string {
  const digest = createHash('sha256').update(commandKey).digest('hex');
  return `report-manual-${digest.slice(0, 32)}`;
}

export const reportSchedulesSchedulerId = 'report-schedules-5min';
export const reportSchedulesCronPattern = '*/5 * * * *';

/**
 * W7.103 (`BA-reports-14`): retention gets its own daily schedule instead of riding on a delivery sweep. The run
 * log is pruned even when scheduled e-mail is switched off, and the sweep prunes too (before it reads its own
 * configuration), so a missing daily registration cannot keep runs forever.
 */
export const reportSchedulesRetentionSchedulerId = 'report-schedules-retention-daily';
export const reportSchedulesRetentionJobName = 'prune-schedule-runs';
export const reportSchedulesRetentionCronPattern = '17 3 * * *';
/**
 * Retention is idempotent (it deletes by id and re-reads the backlog), so a transient DB error may retry.
 */
export const reportSchedulesRetentionJobAttempts = 3;
export const reportSchedulesRetentionJobBackoffMilliseconds = 60_000;
export const reportSchedulesRetentionCompletedJobsToKeep = 3;
export const reportSchedulesRetentionFailedJobsToKeep = 10;

/**
 * W7.98 (`BA-reports-08`): the schedule lives in Redis, so it has to be re-asserted instead of written once at
 * boot. One Redis roundtrip a minute per worker instance.
 */
export const reportSchedulesReconcileMilliseconds = 60_000;
export const reportSchedulesJobLabel = 'report_schedules';
/**
 * A sweep is retried by the next five-minute slot (the `slotKey` claim makes a re-run safe), so the job itself
 * does not retry: a retried sweep would compete with its own successor for the same slot.
 */
export const reportSchedulesJobAttempts = 1;
export const reportSchedulesJobBackoffMilliseconds = 30_000;
export const reportSchedulesCompletedJobsToKeep = 5;
export const reportSchedulesFailedJobsToKeep = 20;
/**
 * Four scheduling windows. One missed window is a slow sweep or the jitter of a rolling restart; twenty minutes
 * without a single finished sweep means the five-minute sender has stopped and the scheduled reports are not
 * going out, which is what `scheduler.late` should say.
 */
export const reportSchedulesLastSuccessMaxAgeMs = 20 * 60_000;

/** Why a recipient did not get the report (stored in the run log, shown in the UI). */
export const reportRecipientSkipReasons = {
  inactive: 'inactive',
  noAccess: 'no_access',
  emailNotAllowed: 'email_not_allowed',
  deliveryFailed: 'delivery_failed',
  /**
   * W7.99 (`BA-reports-09`): SMTP may have accepted the message, so this is **not** the same fact as
   * `delivery_failed`. A scheduled report is delivered at-least-once: an unknown outcome is never resent
   * automatically (the delivery ledger marks the claim UNKNOWN), and the run log says exactly that instead of
   * claiming the recipient got nothing.
   */
  deliveryUnknown: 'delivery_unknown',
} as const;
export type ReportRecipientSkipReason =
  (typeof reportRecipientSkipReasons)[keyof typeof reportRecipientSkipReasons];

/** Why an attachment was left out. */
export const reportAttachmentOmitReasons = {
  tooManyRows: 'too_many_rows',
  tooLarge: 'too_large',
  packDisabled: 'pack_disabled',
  failed: 'failed',
  /**
   * W7.54 (BA-reports-02): the schedule filters a dimension the pack cannot
   * apply, so the CSV would be broader than the reported scope.
   */
  filterUnsupported: 'filter_unsupported',
} as const;
export type ReportAttachmentOmitReason =
  (typeof reportAttachmentOmitReasons)[keyof typeof reportAttachmentOmitReasons];

/** Run-level error codes. */
export const reportRunErrorCodes = {
  missed: 'missed',
  emailDisabled: 'email_disabled',
  scheduledDisabled: 'scheduled_disabled',
  reportsDisabled: 'reports_disabled',
  noRecipients: 'no_recipients',
  buildFailed: 'build_failed',
} as const;
