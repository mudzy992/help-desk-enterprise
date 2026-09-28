import { directorySyncQueueName } from '../directory-sync/ldaps/directory-sync.job.constants';
import { inboundEmailQueueName } from '../inbound-email/inbound-email.constants';
import { integrationQueueName } from '../integration-queue/integration-queue.constants';
import { integrationWorkerMaintenanceQueueName } from '../integration-queue/integration-worker-maintenance.job.constants';
import { knowledgeBaseReviewReminderQueueName } from '../knowledge-base/knowledge-base-review-reminder.job.constants';
import { notificationRetentionQueueName } from '../notifications/notification-retention.constants';
import { notificationDigestQueueName } from '../notifications/preferences/notification-digest.constants';
import { privacyQueueName } from '../privacy/privacy.constants';
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
] as const;

export const opsProbeTimeouts = {
  databaseMs: 2_000,
  redisMs: 1_000,
  clamavMs: 3_000,
  queueMs: 3_000,
  uptimePushMs: 5_000,
} as const;
