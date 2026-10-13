/**
 * Paket 5.4.2 (stavka 3): signed webhook export of the auth and security audit
 * rows. The worker reads the tamper-evident audit log in order, posts batches
 * and keeps a cursor, so a restart or a slow endpoint never loses or repeats a
 * row (a repeat is possible only if the endpoint accepted a batch but the
 * cursor write failed - the receiver dedupes on `event.id`).
 */
export const securityAuditWebhookQueueName = 'security-audit-webhook';
export const securityAuditWebhookSchedulerId = 'security-audit-webhook-tick';
export const securityAuditWebhookJobName = 'security-audit-webhook-tick';
/** A tick every minute: a failing endpoint is retried at this fixed cadence. */
export const securityAuditWebhookIntervalMs = 60_000;

/** Only these audit action prefixes are exported (the security journal's classes). */
export const securityAuditWebhookActionPrefixes = ['auth.', 'security.'] as const;

export const securityAuditWebhookBatchSize = 100;
/** Caps the work of one tick; a backlog is drained over several ticks. */
export const securityAuditWebhookMaxBatchesPerTick = 10;
/** A row becomes eligible only after this lag, so a late commit is not skipped. */
export const securityAuditWebhookSettleMilliseconds = 10_000;
/** A failure streak longer than this drops the pending rows (counted, not sent). */
export const securityAuditWebhookGiveUpMilliseconds = 24 * 60 * 60 * 1000;
export const securityAuditWebhookTimeoutMilliseconds = 5_000;
export const securityAuditWebhookSchemaVersion = 1;
/** The one state row the export keeps (`SecurityAuditWebhookState.id`). */
export const securityAuditWebhookStateId = 'default';

export const securityAuditWebhookHeaders = {
  timestamp: 'x-helpdesk-timestamp',
  signature: 'x-helpdesk-signature',
} as const;
