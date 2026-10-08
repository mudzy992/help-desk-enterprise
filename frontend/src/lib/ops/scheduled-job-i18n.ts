/** Human-readable, locale-aware names for known BullMQ schedulers. */
export const knownScheduledJobIds = [
  'announcement-sweep-quarter-hourly',
  'asset-directory-sync-hourly',
  'asset-reminders-hourly',
  'change-sweep-quarter-hourly',
  'directory-sync-quarter-hourly',
  'inbound-email-poll',
  'inbound-email-retention',
  'integration-dlq-retention-interval',
  'integration-worker-heartbeat-every',
  'kb-review-reminder-quarter-hourly',
  'notification-digest-5min',
  'notification-retention-daily',
  'on-call-sweep-quarter-hourly',
  'ops-health-check',
  'privacy-15min',
  'problem-sweep-hourly',
  'report-schedules-5min',
  'sla-scan-every-minute',
  'ticket-archive-quarter-hourly',
  'ticket-time-tracking-sweep-5min',
  'unrouted-sweep-quarter-hourly',
  'waiting-for-user-quarter-hourly',
] as const;

const knownJobIds = new Set<string>(knownScheduledJobIds);

function keySlug(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * BullMQ may expose either the registered scheduler id or its Redis key. Match
 * an exact id or a colon-delimited component; never infer a label from an
 * arbitrary partial substring.
 */
export function scheduledJobTranslationKey(schedulerId: string): string | null {
  const direct = schedulerId.trim();
  const candidate = knownJobIds.has(direct)
    ? direct
    : direct.split(/[:/]/).find((part) => knownJobIds.has(part));
  return candidate === undefined
    ? null
    : `admin.opsHealth.schedulers.names.${keySlug(candidate)}`;
}
