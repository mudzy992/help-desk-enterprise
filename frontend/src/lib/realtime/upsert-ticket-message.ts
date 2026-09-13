import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

const pendingPrefix = "pending:";

export function createPendingMessageId(): string {
  return `${pendingPrefix}${crypto.randomUUID()}`;
}

export function isPendingMessageId(messageId: string): boolean {
  return messageId.startsWith(pendingPrefix);
}

export function upsertTicketMessage(
  current: readonly TicketMessageResponse[],
  incoming: TicketMessageResponse,
): TicketMessageResponse[] {
  if (current.some((message) => message.id === incoming.id)) {
    return [...current];
  }
  const withoutPendingDuplicate = current.filter(
    (message) =>
      !(
        isPendingMessageId(message.id) &&
        message.type === incoming.type &&
        message.body === incoming.body &&
        message.authorUserId === incoming.authorUserId
      ),
  );
  return [...withoutPendingDuplicate, incoming];
}

export function reconcileOptimisticMessage(
  current: readonly TicketMessageResponse[],
  confirmed: TicketMessageResponse,
  pendingId: string,
): TicketMessageResponse[] {
  return upsertTicketMessage(
    current.filter((message) => message.id !== pendingId),
    confirmed,
  );
}

export function isStaleTicketEvent(
  openTicketId: string | undefined,
  eventTicketId: string,
): boolean {
  return openTicketId === undefined || openTicketId !== eventTicketId;
}
