import { useCallback, useEffect, useRef, useState } from "react";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { useSession } from "@/lib/session/use-session";
import { applyPresenceUpdate, emptyPresenceView, type PresenceView } from "@/lib/tickets/presence-view";

/* Paket 2.4 (A1): heartbeat every 20 s, state changes at most every 2 s,
   typing falls back to viewing after 6 s without a keystroke. */
const heartbeatMs = 20_000;
const minimumGapMs = 2_000;
const typingIdleMs = 6_000;
const firstBeatDelayMs = 1_200;

export type TypingChannel = "public" | "internal";

export function useTicketPresence(input: {
  readonly ticketId: string | undefined;
  readonly currentUserId: string | null;
  readonly enabled: boolean;
}): { readonly view: PresenceView; readonly reportTyping: (channel: TypingChannel | null) => void } {
  const { session } = useSession();
  const [view, setView] = useState<PresenceView>(emptyPresenceView);
  const stateRef = useRef<{ state: "viewing" | "typing"; channel: TypingChannel }>({
    state: "viewing",
    channel: "public",
  });
  const lastSentRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const idleRef = useRef<number | null>(null);
  const emitRef = useRef<(() => void) | null>(null);

  const { ticketId, currentUserId, enabled } = input;

  useEffect(() => {
    setView(emptyPresenceView);
    if (session === null || ticketId === undefined || !enabled) {
      emitRef.current = null;
      return;
    }
    const socket = acquireHelpdeskSocket(session.accessToken);
    const emit = () => {
      lastSentRef.current = Date.now();
      socket.emit(ticketSocketEvents.presence, {
        ticketId,
        state: stateRef.current.state,
        channel: stateRef.current.channel,
      });
    };
    emitRef.current = emit;
    const stopUpdate = subscribeSocketEvent<unknown>(socket, ticketSocketEvents.presenceUpdate, (payload) => {
      const next = applyPresenceUpdate(ticketId, currentUserId, payload);
      if (next !== null) setView(next);
    });
    // The join is handled first on the server; give it a moment before the first beat.
    const first = window.setTimeout(emit, firstBeatDelayMs);
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") emit();
    }, heartbeatMs);
    const stopConnect = subscribeSocketEvent(socket, "connect", () => {
      window.setTimeout(emit, firstBeatDelayMs);
    });
    return () => {
      window.clearTimeout(first);
      window.clearInterval(beat);
      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
      if (idleRef.current !== null) window.clearTimeout(idleRef.current);
      stopUpdate();
      stopConnect();
      socket.emit(ticketSocketEvents.presence, { ticketId, state: "leave", channel: "public" });
      emitRef.current = null;
      stateRef.current = { state: "viewing", channel: "public" };
      releaseHelpdeskSocket();
    };
  }, [currentUserId, enabled, session, ticketId]);

  const send = useCallback(() => {
    const emit = emitRef.current;
    if (emit === null) return;
    const wait = lastSentRef.current + minimumGapMs - Date.now();
    if (wait <= 0) {
      emit();
      return;
    }
    if (pendingRef.current === null) {
      pendingRef.current = window.setTimeout(() => {
        pendingRef.current = null;
        emitRef.current?.();
      }, wait);
    }
  }, []);

  const reportTyping = useCallback(
    (channel: TypingChannel | null) => {
      const next = channel === null
        ? { state: "viewing" as const, channel: stateRef.current.channel }
        : { state: "typing" as const, channel };
      const changed = next.state !== stateRef.current.state || next.channel !== stateRef.current.channel;
      stateRef.current = next;
      if (idleRef.current !== null) window.clearTimeout(idleRef.current);
      if (channel !== null) {
        idleRef.current = window.setTimeout(() => {
          stateRef.current = { state: "viewing", channel: stateRef.current.channel };
          send();
        }, typingIdleMs);
      }
      if (changed) send();
    },
    [send],
  );

  return { view, reportTyping };
}
