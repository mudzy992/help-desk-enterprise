import { reportClientError } from "@/lib/app/client-logger";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ApiError } from "@/services/api";
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
import { getTicket, type TicketResponse } from "@/services/tickets-api";
import type { Dispatch, SetStateAction } from "react";

type LoadTicketDetailTarget = {
  readonly ticketId: string;
  readonly silent: boolean;
  readonly setTicket: Dispatch<SetStateAction<TicketResponse | null>>;
  readonly setMessages: Dispatch<SetStateAction<readonly TicketMessageResponse[]>>;
  readonly setParticipants: Dispatch<SetStateAction<readonly TicketParticipantResponse[]>>;
  readonly setTimeLogs: Dispatch<SetStateAction<readonly TicketTimeLogResponse[]>>;
  readonly setAttachments: Dispatch<SetStateAction<readonly TicketAttachmentResponse[]>>;
  readonly setAttachmentsVisible: Dispatch<SetStateAction<boolean>>;
  readonly setTimeVisible: Dispatch<SetStateAction<boolean>>;
  readonly setErrorKey: Dispatch<SetStateAction<TicketErrorKey | null>>;
  readonly setActionError: Dispatch<SetStateAction<TicketErrorKey | null>>;
  readonly setIsLoading: Dispatch<SetStateAction<boolean>>;
};

/** Odgovor 403 ili 404 znači da panel nije dostupan korisniku, a ne da je stranica zakazala. */
function isMissingAccess(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

/**
 * Učitava panel pored prepiske. Uspješno čitanje ga prikazuje, a neuspjelo
 * skriva, pa nedostupni panel ne postaje greška cijele stranice. Ostale greške
 * prijavljujemo jer bi se u suprotnom kvar samo tiho sakrio.
 */
async function readPanel(
  failureEvent: string,
  read: () => Promise<void>,
  setVisible: (visible: boolean) => void,
  setError: (error: TicketErrorKey) => void,
): Promise<void> {
  try {
    await read();
    setVisible(true);
  } catch (error) {
    setVisible(false);
    if (!isMissingAccess(error)) {
      setError(mapTicketError(error));
      reportClientError(failureEvent, error);
    }
  }
}

export async function loadTicketDetail(target: LoadTicketDetailTarget): Promise<void> {
  target.setActionError(null);
  if (!target.silent) {
    target.setIsLoading(true);
    target.setErrorKey(null);
  }
  try {
    const loaded = await getTicket(target.ticketId);
    target.setTicket(loaded);
    // Poruke i učesnici određuju hoće li se stranica otvoriti; njihova greška
    // jeste greška stranice, dok dodatni paneli nisu uslov. Sva četiri čitanja
    // pokreću se istovremeno, pa detalj čeka samo najsporije od njih.
    const [messageRows, participantRows] = await Promise.all([
      listTicketMessages(target.ticketId),
      listTicketParticipants(target.ticketId),
      readPanel(
        "ticket_time_logs_failed",
        async () => {
          target.setTimeLogs(await listTicketTimeLogs(target.ticketId));
        },
        target.setTimeVisible,
        target.setActionError,
      ),
      readPanel(
        "ticket_attachments_failed",
        async () => {
          target.setAttachments(await listTicketAttachments(target.ticketId));
        },
        target.setAttachmentsVisible,
        target.setActionError,
      ),
    ]);
    target.setMessages(messageRows);
    target.setParticipants(participantRows);
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
