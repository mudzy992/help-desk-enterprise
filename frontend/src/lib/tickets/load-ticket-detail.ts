import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  listTicketAttachments,
  type TicketAttachmentResponse,
} from "@/services/tickets-attachments-api";
import {
  listTicketMessages,
  listTicketParticipants,
  listTicketTimeLogs,
  type TicketMessageResponse,
  type TicketParticipantResponse,
  type TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";
import { getTicket, listGroupInbox, type TicketResponse } from "@/services/tickets-api";
import type { Dispatch, SetStateAction } from "react";

type LoadTicketDetailTarget = {
  readonly ticketId: string;
  readonly silent: boolean;
  readonly setTicket: Dispatch<SetStateAction<TicketResponse | null>>;
  readonly setMessages: Dispatch<SetStateAction<readonly TicketMessageResponse[]>>;
  readonly setParticipants: Dispatch<SetStateAction<readonly TicketParticipantResponse[]>>;
  readonly setTimeLogs: Dispatch<SetStateAction<readonly TicketTimeLogResponse[]>>;
  readonly setAttachments: Dispatch<SetStateAction<readonly TicketAttachmentResponse[]>>;
  readonly setInboxAccessible: Dispatch<SetStateAction<boolean>>;
  readonly setAttachmentsVisible: Dispatch<SetStateAction<boolean>>;
  readonly setTimeVisible: Dispatch<SetStateAction<boolean>>;
  readonly setErrorKey: Dispatch<SetStateAction<TicketErrorKey | null>>;
  readonly setIsLoading: Dispatch<SetStateAction<boolean>>;
};

export async function loadTicketDetail(target: LoadTicketDetailTarget): Promise<void> {
  if (!target.silent) {
    target.setIsLoading(true);
    target.setErrorKey(null);
  }
  try {
    const loaded = await getTicket(target.ticketId);
    target.setTicket(loaded);
    const [messageRows, participantRows] = await Promise.all([
      listTicketMessages(target.ticketId),
      listTicketParticipants(target.ticketId),
    ]);
    target.setMessages(messageRows);
    target.setParticipants(participantRows);
    await listGroupInbox()
      .then(() => target.setInboxAccessible(true))
      .catch(() => target.setInboxAccessible(false));
    await listTicketTimeLogs(target.ticketId)
      .then((rows) => {
        target.setTimeLogs(rows);
        target.setTimeVisible(true);
      })
      .catch(() => target.setTimeVisible(false));
    await listTicketAttachments(target.ticketId)
      .then((rows) => {
        target.setAttachments(rows);
        target.setAttachmentsVisible(true);
      })
      .catch(() => target.setAttachmentsVisible(false));
  } catch (error) {
    if (!target.silent) {
      target.setTicket(null);
      target.setErrorKey(mapTicketError(error));
    }
  } finally {
    if (!target.silent) {
      target.setIsLoading(false);
    }
  }
}
