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

export const reportSchedulesQueueName = 'report-schedules';
export const reportSchedulesSweepJobName = 'sweep-due-schedules';
export const reportSchedulesManualJobName = 'run-schedule-now';
export const reportSchedulesSchedulerId = 'report-schedules-5min';
export const reportSchedulesCronPattern = '*/5 * * * *';

/** Why a recipient did not get the report (stored in the run log, shown in the UI). */
export const reportRecipientSkipReasons = {
  inactive: 'inactive',
  noAccess: 'no_access',
  emailNotAllowed: 'email_not_allowed',
  deliveryFailed: 'delivery_failed',
} as const;
export type ReportRecipientSkipReason =
  (typeof reportRecipientSkipReasons)[keyof typeof reportRecipientSkipReasons];

/** Why an attachment was left out. */
export const reportAttachmentOmitReasons = {
  tooManyRows: 'too_many_rows',
  tooLarge: 'too_large',
  packDisabled: 'pack_disabled',
  failed: 'failed',
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
