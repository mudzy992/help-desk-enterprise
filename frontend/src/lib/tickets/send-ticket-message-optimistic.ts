import {
  createTicketMessage,
  type MessageType,
  type TicketMessageResponse,
} from "@/services/tickets-collaboration-api";
import { getTicket, type TicketResponse } from "@/services/tickets-api";
import { reportClientError } from "@/lib/app/client-logger";
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
  readonly alsoToMerged?: boolean;
  readonly responseTemplateId?: string;
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
      ...(input.alsoToMerged === true ? { alsoToMerged: true } : {}),
      ...(input.responseTemplateId === undefined
        ? {}
        : { responseTemplateId: input.responseTemplateId }),
    });
    input.setMessages((current) => reconcileOptimisticMessage(current, created, pendingId));
  } catch (error) {
    input.setMessages((current) => current.filter((message) => message.id !== pendingId));
    input.setActionError(mapTicketError(error));
    throw error;
  }
  // Poruka je već sačuvana. Pad osvježavanja ne smije je prikazati kao neuspjelu:
  // composer bi zadržao tekst, pa bi sljedeći klik poslao isti javni odgovor opet.
  // Zaglavlje može kratko kasniti; socket i naredno učitavanje ga osvježe.
  try {
    input.setTicket(await getTicket(input.ticketId));
  } catch (error) {
    reportClientError("ticket_refresh_after_send_failed", error, input.ticketId);
  }
}
