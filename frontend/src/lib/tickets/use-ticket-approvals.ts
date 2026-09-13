import { useCallback, useEffect, useState } from "react";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { type TicketUpdatedRealtimePayload } from "@/lib/realtime/apply-ticket-updated";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { useSession } from "@/lib/session/use-session";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
import {
  approveTicketApproval,
  listTicketApprovals,
  rejectTicketApproval,
  type TicketApprovalResponse,
} from "@/services/tickets-approvals-api";
import type { TicketResponse } from "@/services/tickets-api";

export function useTicketApprovals(ticketId: string | undefined) {
  const { session } = useSession();
  const [items, setItems] = useState<readonly TicketApprovalResponse[]>([]);
  const [visible, setVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);

  const load = useCallback(async () => {
    if (ticketId === undefined) {
      return;
    }
    try {
      setItems(await listTicketApprovals(ticketId));
      setVisible(true);
    } catch {
      setItems([]);
      setVisible(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (session === null || ticketId === undefined) {
      return;
    }
    const socket = acquireHelpdeskSocket(session.accessToken);
    const stop = subscribeSocketEvent<TicketUpdatedRealtimePayload>(
      socket,
      ticketSocketEvents.ticketUpdated,
      (payload) => {
        if (payload.ticketId !== ticketId || payload.change !== "approval") {
          return;
        }
        void load();
      },
    );
    return () => {
      stop();
      releaseHelpdeskSocket();
    };
  }, [load, session, ticketId]);

  const decide = async (
    run: (id: string, approvalId: string, comment: string) => Promise<TicketResponse>,
    approvalId: string,
    comment: string,
  ) => {
    if (ticketId === undefined) {
      return null;
    }
    setErrorKey(null);
    setIsSaving(true);
    try {
      const ticket = await run(ticketId, approvalId, comment);
      await load();
      return ticket;
    } catch (error) {
      setErrorKey(mapTicketError(error));
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    items,
    visible,
    isSaving,
    errorKey,
    approve: (approvalId: string, comment: string) =>
      decide(approveTicketApproval, approvalId, comment),
    reject: (approvalId: string, comment: string) =>
      decide(rejectTicketApproval, approvalId, comment),
  };
}
