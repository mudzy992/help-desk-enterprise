export const ticketMessageDeliveryTopic = 'ticket.message.delivery';
export const ticketSlaEffectsTopic = 'ticket.sla.effects';
export const ticketPlaybookAutoAttachTopic = 'ticket.playbook.auto-attach';
export const ticketSideEffectOutboxTopics = [
  ticketMessageDeliveryTopic,
  ticketSlaEffectsTopic,
  ticketPlaybookAutoAttachTopic,
] as const;
export const ticketSideEffectOutboxWarningAgeMs = 5 * 60_000;
