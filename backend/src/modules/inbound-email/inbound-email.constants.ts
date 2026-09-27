/** Paket 2.3 (§7): inbound mailbox pass. The real interval is `pollSeconds` (checked inside). */
export const inboundEmailQueueName = 'inbound-email';
export const inboundEmailPollJobName = 'poll-mailbox';
export const inboundEmailRetentionJobName = 'apply-retention';
export const inboundEmailPollSchedulerId = 'inbound-email-poll';
export const inboundEmailRetentionSchedulerId = 'inbound-email-retention';
/** Smallest allowed `pollSeconds`; the service skips ticks that are not due. */
export const inboundEmailTickMilliseconds = 30_000;
/** Nightly retention at 03:20 (server time). */
export const inboundEmailRetentionCronPattern = '20 3 * * *';
