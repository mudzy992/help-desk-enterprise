import { directorySyncQueueName } from '../directory-sync/ldaps/directory-sync.job.constants';
import {
  assetRemindersCronPattern,
  assetRemindersQueueName,
  assetRemindersSchedulerId,
} from '../assets/reminders/asset-reminders.constants';
import {
  problemSweepCronPattern,
  problemSweepQueueName,
  problemSweepSchedulerId,
} from '../problems/sweep/problem-sweep.constants';
import {
  changeSweepCronPattern,
  changeSweepLastSuccessMaxAgeMs,
  changeSweepQueueName,
  changeSweepSchedulerId,
} from '../changes/sweep/change-sweep.constants';
import {
  assetDirectorySyncCronPattern,
  assetDirectorySyncQueueName,
  assetDirectorySyncSchedulerId,
} from '../assets/directory/asset-directory-sync.constants';
import { inboundEmailQueueName } from '../inbound-email/inbound-email.constants';
import { integrationQueueName } from '../integration-queue/integration-queue.constants';
import { integrationWorkerMaintenanceQueueName } from '../integration-queue/integration-worker-maintenance.job.constants';
import { knowledgeBaseReviewReminderQueueName } from '../knowledge-base/knowledge-base-review-reminder.job.constants';
import { notificationRetentionQueueName } from '../notifications/notification-retention.constants';
import { notificationDigestQueueName } from '../notifications/preferences/notification-digest.constants';
import { privacyQueueName } from '../privacy/privacy.constants';
import { onCallSweepQueueName } from '../on-call/on-call-sweep.job.constants';
import { announcementSweepQueueName } from '../announcements/announcement-sweep.job.constants';
import { reportSchedulesQueueName } from '../reports/schedules/report-schedule.constants';
import { slaScanQueueName } from '../sla/sla-scan.constants';
import { ticketArchiveQueueName } from '../tickets/archive/ticket-archive.job.constants';
import { timeTrackingSweepQueueName } from '../tickets/time-tracking/time-tracking-sweep.job.constants';
import { unroutedSweepQueueName } from '../tickets/unrouted/unrouted-sweep.job.constants';
import { waitingForUserQueueName } from '../tickets/waiting-for-user/waiting-for-user.job.constants';

export const opsHealthQueueName = 'ops-health';
export const opsHealthSchedulerId = 'ops-health-check';
export const opsHealthJobName = 'ops-health-check';
export const opsHealthIntervalMs = 60_000;
/** A round does ~15 cheap Redis/DB calls; the lock guards against a hung probe. */
export const opsHealthLockDurationMs = 45_000;

/**
 * Every BullMQ queue the worker owns (§4.1). The health loop inspects them
 * read-only (schedulers, counts, last completed/failed job). A new queue is
 * added here and to the `worker.module.spec` list; `ops-health` watches itself
 * through the API watchdog (`ops.monitor.stale`).
 */
export const opsMonitoredQueueNames = [
  slaScanQueueName,
  integrationQueueName,
  integrationWorkerMaintenanceQueueName,
  notificationRetentionQueueName,
  notificationDigestQueueName,
  ticketArchiveQueueName,
  waitingForUserQueueName,
  timeTrackingSweepQueueName,
  unroutedSweepQueueName,
  knowledgeBaseReviewReminderQueueName,
  directorySyncQueueName,
  inboundEmailQueueName,
  reportSchedulesQueueName,
  privacyQueueName,
  onCallSweepQueueName,
  announcementSweepQueueName,
  assetRemindersQueueName,
  assetDirectorySyncQueueName,
  problemSweepQueueName,
  changeSweepQueueName,
] as const;

export const opsProbeTimeouts = {
  databaseMs: 2_000,
  redisMs: 1_000,
  clamavMs: 3_000,
  queueMs: 3_000,
  assetDatabaseMs: 3_000,
  assetFileScanMs: 3_000,
  assetOperationsMs: 6_000,
  problemOperationsMs: 3_000,
  /** W7.33: one bounded page of owned problems, then two bulk reads. */
  problemOwnerDriftMs: 3_000,
  /** W7.69: change reminder/downtime counters plus one Redis read. */
  changeOperationsMs: 3_000,
  uptimePushMs: 5_000,
} as const;

/**
 * Asset schedules are hourly cron jobs. Permit one complete hourly window plus
 * the generic cron grace before the last-success gate becomes late.
 */
export const assetSchedulerLastSuccessMaxAgeMs = 75 * 60_000;
export const expectedAssetSchedulers = [
  {
    queue: assetDirectorySyncQueueName,
    schedulerId: assetDirectorySyncSchedulerId,
    pattern: assetDirectorySyncCronPattern,
    lastSuccessMaxAgeMs: assetSchedulerLastSuccessMaxAgeMs,
  },
  {
    queue: assetRemindersQueueName,
    schedulerId: assetRemindersSchedulerId,
    pattern: assetRemindersCronPattern,
    lastSuccessMaxAgeMs: assetSchedulerLastSuccessMaxAgeMs,
  },
] as const;

/**
 * W7.32 (BA-problems-14): the hourly problem sweep is just as mandatory as the
 * asset schedules, and it runs every hour at minute 23. The same one-window-plus-
 * grace budget applies before "the last sweep is late" counts, because the sweep
 * is also the only auto-close driver.
 */
export const problemSchedulerLastSuccessMaxAgeMs = 75 * 60_000;
export const expectedProblemSchedulers = [
  {
    queue: problemSweepQueueName,
    schedulerId: problemSweepSchedulerId,
    pattern: problemSweepCronPattern,
    lastSuccessMaxAgeMs: problemSchedulerLastSuccessMaxAgeMs,
  },
] as const;

/**
 * W7.69 (BA-changes-13): the quarter-hourly change sweep produces the start
 * reminders and the overrun warnings. Its absence used to be invisible — the
 * schedule was registered once at boot and a Redis flush deleted it silently —
 * so it is now an expected scheduler like the asset and problem sweeps: missing
 * registration, a job nobody picked up, a failing job and a last success older
 * than one window plus grace all reach `scheduler.late`.
 */
export const expectedChangeSchedulers = [
  {
    queue: changeSweepQueueName,
    schedulerId: changeSweepSchedulerId,
    pattern: changeSweepCronPattern,
    lastSuccessMaxAgeMs: changeSweepLastSuccessMaxAgeMs,
  },
] as const;

/**
 * Schedules whose absence must be visible even when Redis is empty: the health
 * collector synthesises their rows (with `registered: false`) instead of leaving
 * the card and the alarm blind.
 */
export const expectedSchedulers = [
  ...expectedAssetSchedulers,
  ...expectedProblemSchedulers,
  ...expectedChangeSchedulers,
] as const;

/**
 * W7.69 (BA-changes-13): a downtime-drift pass older than two reconciler
 * intervals (30 s each) plus margin means the scanner stopped — the number it
 * left behind no longer describes "now", so the card reports unknown instead of
 * a stale "no drift".
 */
export const changeDriftPassMaxAgeMs = 10 * 60_000;
