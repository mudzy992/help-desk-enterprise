import {
  createTicketMessage,
  type MessageType,
  type TicketMessageResponse,
} from "@/services/tickets-collaboration-api";
import { getTicket, type TicketResponse } from "@/services/tickets-api";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  createPendingMessageId,
  reconcileOptimisticMessage,
} from "@/lib/realtime/upsert-ticket-message";
import type { Dispatch, SetStateAction } from "react";

export async function sendTicketMessageOptimistic(input: {
  readonly ticketId: string;
  readonly type: MessageType;
  readonly body: string;
  readonly authorUserId: string | null;
  readonly setMessages: Dispatch<SetStateAction<readonly TicketMessageResponse[]>>;
  readonly setTicket: Dispatch<SetStateAction<TicketResponse | null>>;
  readonly setActionError: Dispatch<SetStateAction<TicketErrorKey | null>>;
}): Promise<void> {
  const pendingId = createPendingMessageId();
  const pending: TicketMessageResponse = {
    id: pendingId,
    ticketId: input.ticketId,
    type: input.type,
    body: input.body,
    authorUserId: input.authorUserId,
    createdAt: new Date().toISOString(),
  };
  input.setActionError(null);
  input.setMessages((current) => [...current, pending]);
  try {
    const created = await createTicketMessage(input.ticketId, {
      type: input.type,
      body: input.body,
    });
    input.setMessages((current) =>
      reconcileOptimisticMessage(current, created, pendingId),
    );
    input.setTicket(await getTicket(input.ticketId));
  } catch (error) {
    input.setMessages((current) =>
      current.filter((message) => message.id !== pendingId),
    );
    input.setActionError(mapTicketError(error));
    throw error;
  }
}
