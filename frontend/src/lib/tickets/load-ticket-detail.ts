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
  readonly isCurrent?: () => boolean;
  readonly onAccessDenied?: () => void;
  readonly onAccessGranted?: () => void;
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
  isCurrent: () => boolean,
): Promise<void> {
  try {
    await read();
    if (isCurrent()) setVisible(true);
  } catch (error) {
    if (!isCurrent()) return;
    setVisible(false);
    if (!isMissingAccess(error)) {
      setError(mapTicketError(error));
      reportClientError(failureEvent, error);
    }
  }
}

export async function loadTicketDetail(target: LoadTicketDetailTarget): Promise<void> {
  const isCurrent = target.isCurrent ?? (() => true);
  let accessRevoked = false;
  const canApplyPanels = () => isCurrent() && !accessRevoked;
  if (!isCurrent()) return;
  target.setActionError(null);
  if (!target.silent) {
    target.setIsLoading(true);
    target.setErrorKey(null);
  }
  try {
    const loaded = await getTicket(target.ticketId);
    if (!isCurrent()) return;
    target.onAccessGranted?.();
    target.setTicket(loaded);
    target.setErrorKey(null);
    // Poruke i učesnici određuju hoće li se stranica otvoriti; njihova greška
    // jeste greška stranice, dok dodatni paneli nisu uslov. Sva četiri čitanja
    // pokreću se istovremeno, pa detalj čeka samo najsporije od njih.
    const [messageRows, participantRows] = await Promise.all([
      listTicketMessages(target.ticketId),
      listTicketParticipants(target.ticketId),
      readPanel(
        "ticket_time_logs_failed",
        async () => {
          const rows = await listTicketTimeLogs(target.ticketId);
          if (canApplyPanels()) target.setTimeLogs(rows);
        },
        target.setTimeVisible,
        target.setActionError,
        canApplyPanels,
      ),
      readPanel(
        "ticket_attachments_failed",
        async () => {
          const rows = await listTicketAttachments(target.ticketId);
          if (canApplyPanels()) target.setAttachments(rows);
        },
        target.setAttachmentsVisible,
        target.setActionError,
        canApplyPanels,
      ),
    ]);
    if (!isCurrent()) return;
    target.setMessages(messageRows);
    target.setParticipants(participantRows);
  } catch (error) {
    if (!isCurrent()) return;
    if (isMissingAccess(error)) {
      accessRevoked = true;
      target.onAccessDenied?.();
      target.setTicket(null);
      target.setMessages([]);
      target.setParticipants([]);
      target.setTimeLogs([]);
      target.setAttachments([]);
      target.setTimeVisible(false);
      target.setAttachmentsVisible(false);
      target.setErrorKey(mapTicketError(error));
      target.setIsLoading(false);
    } else if (!target.silent) {
      target.setTicket(null);
      target.setErrorKey(mapTicketError(error));
    } else {
      target.setErrorKey(mapTicketError(error));
      target.setActionError(mapTicketError(error));
    }
  } finally {
    if (isCurrent()) target.setIsLoading(false);
  }
}
