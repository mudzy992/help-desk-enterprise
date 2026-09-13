import { useEffect, useRef } from "react";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import {
  joinTicketRoom,
  leaveTicketRoom,
  ticketSocketEvents,
} from "@/services/ticket-socket";
import {
  applyTicketUpdatedPayload,
  type TicketUpdatedRealtimePayload,
} from "@/lib/realtime/apply-ticket-updated";
import { nextJoinedTicketRoom } from "@/lib/realtime/next-joined-ticket-room";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import {
  isStaleTicketEvent,
  upsertTicketMessage,
} from "@/lib/realtime/upsert-ticket-message";
import { useSession } from "@/lib/session/use-session";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type { TicketResponse } from "@/services/tickets-api";
import type { Dispatch, SetStateAction } from "react";

type UseTicketRealtimeInput = {
  readonly ticketId: string | undefined;
  readonly applyTicket: Dispatch<SetStateAction<TicketResponse | null>>;
  readonly setMessages: Dispatch<SetStateAction<readonly TicketMessageResponse[]>>;
  readonly reload: () => Promise<void>;
};

export function useTicketRealtime({
  ticketId,
  applyTicket,
  setMessages,
  reload,
}: UseTicketRealtimeInput): void {
  const { session } = useSession();
  const joinedRef = useRef<string | null>(null);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const socket = acquireHelpdeskSocket(session.accessToken);
    const next = nextJoinedTicketRoom(joinedRef.current, ticketId);
    if (next.leave !== null) {
      leaveTicketRoom(socket, next.leave);
    }
    if (next.join !== null) {
      joinTicketRoom(socket, next.join);
      joinedRef.current = next.join;
    }
    if (ticketId === undefined) {
      joinedRef.current = null;
    }
    const stopConnect = subscribeSocketEvent(socket, "connect", () => {
      if (joinedRef.current !== null) {
        joinTicketRoom(socket, joinedRef.current);
      }
      void reload();
    });
    const stopMessage = subscribeSocketEvent<TicketMessageResponse>(
      socket,
      ticketSocketEvents.messageCreated,
      (payload) => {
        if (isStaleTicketEvent(ticketId, payload.ticketId)) {
          return;
        }
        setMessages((current) => upsertTicketMessage(current, payload));
      },
    );
    const stopUpdated = subscribeSocketEvent<TicketUpdatedRealtimePayload>(
      socket,
      ticketSocketEvents.ticketUpdated,
      (payload) => {
        if (isStaleTicketEvent(ticketId, payload.ticketId)) {
          return;
        }
        applyTicket((current) => applyTicketUpdatedPayload(current, payload));
      },
    );
    return () => {
      stopConnect();
      stopMessage();
      stopUpdated();
      if (joinedRef.current !== null) {
        leaveTicketRoom(socket, joinedRef.current);
        joinedRef.current = null;
      }
      releaseHelpdeskSocket();
    };
  }, [applyTicket, reload, session, setMessages, ticketId]);
}
