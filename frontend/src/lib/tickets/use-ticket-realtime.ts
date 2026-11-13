import { useEffect, useState } from "react";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { joinTicketRoom, leaveTicketRoom, ticketSocketEvents } from "@/services/ticket-socket";
import {
  applyTicketUpdatedPayload,
  type TicketUpdatedRealtimePayload,
} from "@/lib/realtime/apply-ticket-updated";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { isStaleTicketEvent, upsertTicketMessage } from "@/lib/realtime/upsert-ticket-message";
import { useSession } from "@/lib/session/use-session";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type { TicketResponse } from "@/services/tickets-api";
import type { Dispatch, SetStateAction } from "react";

type UseTicketRealtimeInput = {
  readonly ticketId: string | undefined;
  readonly applyTicket: Dispatch<SetStateAction<TicketResponse | null>>;
  readonly setMessages: Dispatch<SetStateAction<readonly TicketMessageResponse[]>>;
  readonly reload: () => Promise<void>;
  readonly invalidateSnapshot: () => void;
  readonly onJoinFailure: () => void;
  readonly canApplyRealtime: () => boolean;
  readonly onAccessInvalidated: () => void;
};

export function useTicketRealtime({
  ticketId,
  applyTicket,
  setMessages,
  reload,
  invalidateSnapshot,
  onJoinFailure,
  canApplyRealtime,
  onAccessInvalidated,
}: UseTicketRealtimeInput): boolean {
  const { session } = useSession();
  const [joinedTicket, setJoinedTicket] = useState<{
    ticketId: string;
    session: typeof session;
  } | null>(null);

  useEffect(() => {
    if (session === null || ticketId === undefined) return;
    const socket = acquireHelpdeskSocket();
    let active = true;
    let joinGeneration = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      // Prevent an older REST result from overwriting an event that arrived in flight.
      invalidateSnapshot();
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void reload();
      }, 200);
    };
    const join = () => {
      if (!active || !socket.connected) return;
      if (retry !== undefined) clearTimeout(retry);
      const generation = ++joinGeneration;
      joinTicketRoom(socket, ticketId, (error, result) => {
        if (!active || generation !== joinGeneration || !socket.connected) return;
        if (error !== null || result?.ok !== true) {
          setJoinedTicket(null);
          // A failed/timeout ack is not proof of access revocation: re-check REST.
          void reload().then(() => {
            if (active && generation === joinGeneration) onJoinFailure();
          });
          retry = setTimeout(join, 10_000);
          return;
        }
        // Fetch after room membership is confirmed; invalidates older snapshots.
        setJoinedTicket({ ticketId, session });
        void reload();
      });
    };
    const stopConnect = subscribeSocketEvent(socket, "connect", join);
    const stopDisconnect = subscribeSocketEvent(socket, "disconnect", () => {
      setJoinedTicket(null);
      joinGeneration += 1;
      if (retry !== undefined) clearTimeout(retry);
    });
    const stopAccess = subscribeSocketEvent<{ ticketId: string }>(
      socket,
      ticketSocketEvents.ticketAccessInvalidated,
      (payload) => {
        if (payload?.ticketId !== ticketId) return;
        joinGeneration += 1;
        setJoinedTicket(null);
        invalidateSnapshot();
        onAccessInvalidated();
        void reload();
        join();
      },
    );
    const stopMessage = subscribeSocketEvent<TicketMessageResponse>(
      socket,
      ticketSocketEvents.messageCreated,
      (payload) => {
        if (!canApplyRealtime() || isStaleTicketEvent(ticketId, payload.ticketId)) return;
        scheduleRefresh();
        setMessages((current) => upsertTicketMessage(current, payload));
      },
    );
    const stopUpdated = subscribeSocketEvent<TicketUpdatedRealtimePayload>(
      socket,
      ticketSocketEvents.ticketUpdated,
      (payload) => {
        if (!canApplyRealtime() || isStaleTicketEvent(ticketId, payload.ticketId)) return;
        scheduleRefresh();
        applyTicket((current) => applyTicketUpdatedPayload(current, payload));
      },
    );
    join();
    return () => {
      active = false;
      joinGeneration += 1;
      if (retry !== undefined) clearTimeout(retry);
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      stopConnect();
      stopDisconnect();
      stopAccess();
      stopMessage();
      stopUpdated();
      if (socket.connected) leaveTicketRoom(socket, ticketId);
      releaseHelpdeskSocket();
    };
  }, [
    applyTicket,
    canApplyRealtime,
    invalidateSnapshot,
    onAccessInvalidated,
    onJoinFailure,
    reload,
    session,
    setMessages,
    ticketId,
  ]);
  return (
    session !== null &&
    ticketId !== undefined &&
    joinedTicket?.ticketId === ticketId &&
    joinedTicket.session === session
  );
}
