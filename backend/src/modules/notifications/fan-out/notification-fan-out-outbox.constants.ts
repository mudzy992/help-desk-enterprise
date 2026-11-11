export const notificationTicketMessageFanOutTopic =
  'notification.ticket-message.fanout';
export const notificationFanOutOutboxWarningAgeMs = 5 * 60_000;
export const notificationFanOutOutboxDrainIntervalMs = 2_000;
export const notificationFanOutOutboxMaxDispatchPerTick = 50;
export const notificationFanOutDeadLetterReplayCooldownMs = 15 * 60_000;
export const notificationFanOutDeadLetterReplayBatchSize = 10;
