import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeToQueryInvalidation } from "@/lib/realtime/invalidate-on-event";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { bumpSettingsGeneration } from "@/lib/settings/settings-realtime-store";
import { useSession } from "@/lib/session/use-session";
import {
  adminConfigSocketEvents,
  parseAdminConfigEvent,
  publishAdminConfigEvent,
  queryKeysForAdminConfigDomain,
} from "@/lib/realtime/admin-config-events";

type SessionInvalidatedPayload = {
  readonly occurredAt?: string;
};

export function HelpdeskSocketHost() {
  const { session, signOut } = useSession();
  const queryClient = useQueryClient();

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
    // Faza 3.3: the socket is the only place that marks cached queries stale —
    // screens then refetch on their own schedule, and a screen that is not
    // visible pulls nothing at all.
    // Paket 1.7 (R3): admin configuration changes (admins only receive them).
    const stopAdminConfig = subscribeSocketEvent<unknown>(
      socket,
      adminConfigSocketEvents.configUpdated,
      (payload) => {
        const event = parseAdminConfigEvent(payload);
        if (event === null) {
          return;
        }
        for (const key of queryKeysForAdminConfigDomain(event.domain)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        publishAdminConfigEvent(event);
      },
    );
    const stopInvalidation = subscribeToQueryInvalidation({
      socket,
      queryClient,
    });
    return () => {
      stopInvalidated();
      stopSettings();
      stopAdminConfig();
      stopInvalidation();
      releaseHelpdeskSocket();
    };
  }, [queryClient, session, signOut]);

  return null;
}
