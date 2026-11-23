import type { ReportMentionCounts } from '../privacy/anonymization/scrub-report-mentions';

/**
 * W7.104 (`BA-reports-13`): the report module's privacy/anonymisation matrix, in code.
 *
 * The audit found that the module had **no complete matrix**: run `skipped` JSON kept raw user ids for 180 days,
 * schedule creator/updater and manual-run trigger were never touched by an anonymisation, the delivery ledger and
 * the audit chain were only covered by generic paths, the Redis summary cache carries a user id in its **key**,
 * and the e-mailed report leaves the system entirely (SMTP copy plus CSV attachments) with nothing on it saying
 * what it is or how long it may live.
 *
 * Every row below answers four questions for one surface: what identity it holds, how long it lives, what the
 * anonymisation does with it, and which counter proves the action happened. `report-privacy-matrix.spec.ts` keeps
 * the matrix honest: every `Report*` Prisma model has to appear (read from `prisma/schema/reporting.prisma`), every
 * action has to be one of the enumerated outcomes, and every counter has to be one the executor really produces.
 */
export const reportPrivacyActions = [
  /** The row exists only for the person: deleted. */
  'delete',
  /** The identity column becomes `NULL`; the operational row stays. */
  'null',
  /** JSON replica: the person's entries are reduced to their non-identifying fields. */
  'scrub-json',
  /** No personal data — kept for the retention period so reports and audit keep their history. */
  'retain',
  /** Identity is removed by pseudonymising the user row (ids stay, the person behind them does not). */
  'pseudonymous',
  /** Only survives in a cache key with a short TTL; nothing personal in the value. */
  'cache-ttl',
  /** Leaves the controlled system (e-mail copy, CSV attachment): classification and retention travel with it. */
  'outside-system',
] as const;

export type ReportPrivacyAction = (typeof reportPrivacyActions)[number];

/** Counters the anonymisation can add. A matrix row cites one, or none when it is not an executor action. */
export type ReportPrivacyCountKey =
  | keyof ReportMentionCounts
  | 'reportRecipients'
  | 'reportSchedulesPaused'
  | 'emailDeliveries';

export type ReportPrivacyEntry = {
  readonly id: string;
  /** Which Prisma model (or non-DB artifact) this row describes. */
  readonly model: string;
  /** The personal data this surface can hold. */
  readonly identity: string;
  /** How long it lives, in the operator's terms. */
  readonly retention: string;
  readonly action: ReportPrivacyAction;
  readonly countKey: ReportPrivacyCountKey | null;
  /** Where the action is implemented, and what stays behind on purpose. */
  readonly note: string;
};

export const reportPrivacyMatrix: readonly ReportPrivacyEntry[] = [
  {
    id: 'schedule-owner',
    model: 'ReportSchedule',
    identity: 'createdByUserId / updatedByUserId — who set up or last changed the schedule',
    retention: 'life of the schedule (no timer of its own)',
    action: 'null',
    countKey: 'reportSchedulesDetached',
    note: 'scrub-report-mentions.ts clears the two columns separately, so updating somebody else’s schedule cannot erase its creator. The schedule, its recipients and its scope stay.',
  },
  {
    id: 'schedule-recipients',
    model: 'ReportScheduleRecipient',
    identity: 'userId — who receives the report',
    retention: 'life of the schedule',
    action: 'delete',
    countKey: 'reportRecipients',
    note: 'anonymization-executor.ts deletes the recipient rows and pauses a schedule that is left without one (`reportSchedulesPaused`).',
  },
  {
    id: 'run-trigger',
    model: 'ReportScheduleRun',
    identity: 'triggeredByUserId — who pressed “send now”',
    retention: '180 days (reportScheduleLimits.runRetentionDays)',
    action: 'null',
    countKey: 'reportRunsDetached',
    note: 'the run keeps its trigger (MANUAL), period, counters and status; only the operator id goes.',
  },
  {
    id: 'run-skipped-recipients',
    model: 'ReportScheduleRun',
    identity: 'skipped JSON — [{ userId, reason }] for every recipient who was skipped',
    retention: '180 days',
    action: 'scrub-json',
    countKey: 'reportRunSkipped',
    note: 'the entry keeps its reason (inactive, no access, address not allowed, delivery failed/unknown) and loses userId, so “one recipient was inactive” stays readable without saying who. Idempotent: the second pass finds no entry with that id.',
  },
  {
    id: 'run-scope-snapshot',
    model: 'ReportScheduleRun',
    identity: 'scheduleName + organizationalUnitId — organizational scope only',
    retention: '180 days',
    action: 'retain',
    countKey: null,
    note: 'deliberately kept: without it a run log is unreadable after W7.97 detaches a deleted schedule, and it names an organizational unit, never a person.',
  },
  {
    id: 'run-omitted-attachments',
    model: 'ReportScheduleRun',
    identity: 'omittedAttachments JSON — [{ pack, reason }] only',
    retention: '180 days',
    action: 'retain',
    countKey: null,
    note: 'a pack key and a reason; no recipient, no row content.',
  },
  {
    id: 'delivery-ledger',
    model: 'NotificationEmailDelivery',
    identity: 'userId + address of the recipient of a report e-mail',
    retention: 'delivery-ledger retention (not the report retention)',
    action: 'delete',
    countKey: 'emailDeliveries',
    note: 'the generic `emailDeliveries` deletion in anonymization-executor.ts covers the report rows too (dedupeKey `report:<runId>`); the row carries no message body.',
  },
  {
    id: 'audit-chain',
    model: 'AuditLog',
    identity: 'actorUserId / entityId of reports.export, schedule CRUD and “send now”',
    retention: 'audit retention (hash chain)',
    action: 'pseudonymous',
    countKey: null,
    note: 'audit-redaction.ts scrubs metadata that names the person and keeps the ids; the row they point to is the anonymised account. Deliberately not deleted: the chain proves who exported what.',
  },
  {
    id: 'summary-cache',
    model: 'ReportDashboardCache',
    identity: 'user id inside the Redis key `reports:*-summary:<user>:v<ver>:<zone>`',
    retention: '60 s TTL (W7.100)',
    action: 'cache-ttl',
    countKey: null,
    note: 'the value is an aggregate projection, never a list of tickets; the key is unreadable after the TTL and is never persisted. Nothing to evict by id without scanning Redis for a 60-second record.',
  },
  {
    id: 'mail-copy',
    model: 'ScheduledReportEmail',
    identity: 'recipient address, recipient name and the report body in the mailbox / SMTP copy',
    retention: 'outside the application (mail server and mailbox policy)',
    action: 'outside-system',
    countKey: null,
    note: 'the application stores no body and cannot delete a delivered copy. compose-scheduled-report-email.ts therefore puts the classification and the retention expectation into the message itself (`classificationNote`: internal, do not forward, 180-day run history), and the same note travels with every CSV attachment.',
  },
];

export function reportPrivacyEntry(id: string): ReportPrivacyEntry | undefined {
  return reportPrivacyMatrix.find((entry) => entry.id === id);
}
