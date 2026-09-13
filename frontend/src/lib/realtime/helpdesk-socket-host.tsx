import { useEffect } from "react";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { bumpSettingsGeneration } from "@/lib/settings/settings-realtime-store";
import { useSession } from "@/lib/session/use-session";

type SessionInvalidatedPayload = {
  readonly occurredAt?: string;
};

export function HelpdeskSocketHost() {
  const { session, signOut } = useSession();

  useEffect(() => {
    if (session === null) {
      return;
    }
    const socket = acquireHelpdeskSocket(session.accessToken);
    const stopInvalidated = subscribeSocketEvent<SessionInvalidatedPayload>(
      socket,
      ticketSocketEvents.sessionInvalidated,
      () => {
        signOut();
      },
    );
    const stopSettings = subscribeSocketEvent(
      socket,
      ticketSocketEvents.settingsUpdated,
      () => {
        bumpSettingsGeneration();
      },
    );
    return () => {
      stopInvalidated();
      stopSettings();
      releaseHelpdeskSocket();
    };
  }, [session, signOut]);

  return null;
}
