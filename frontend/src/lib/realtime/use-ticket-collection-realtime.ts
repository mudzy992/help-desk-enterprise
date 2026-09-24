import { useEffect } from "react";
import type { GroupFeedChangedPayload } from "@/lib/realtime/group-feed-changed";
import type { TicketUpdatedRealtimePayload } from "@/lib/realtime/apply-ticket-updated";
import type { NotificationRealtimePayload } from "@/lib/realtime/apply-notification-realtime";
import { scheduleDebouncedCallback } from "@/lib/realtime/schedule-debounced-callback";
import {
  shouldInvalidateTicketCollectionFromNotification,
  shouldInvalidateTicketCollectionFromUpdated,
} from "@/lib/realtime/should-invalidate-ticket-collection";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { useSession } from "@/lib/session/use-session";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";

const collectionReloadDebounceMs = 300;

export function useTicketCollectionRealtime(reload: () => Promise<void>): void {
  const { session } = useSession();

  useEffect(() => {
    if (session === null) {
      return;
    }
    const socket = acquireHelpdeskSocket(session.accessToken);
    const debounced = scheduleDebouncedCallback(() => {
      void reload();
    }, collectionReloadDebounceMs);
    const stopUpdated = subscribeSocketEvent<TicketUpdatedRealtimePayload>(
      socket,
      ticketSocketEvents.ticketUpdated,
      (payload) => {
        if (!shouldInvalidateTicketCollectionFromUpdated(payload)) {
          return;
        }
        debounced.trigger();
      },
    );
    const stopCreated = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationCreated,
      (payload) => {
        if (!shouldInvalidateTicketCollectionFromNotification(payload)) {
          return;
        }
        debounced.trigger();
      },
    );
    // Faza 3.2: group rooms only carry the light event, and a screen that is not
    // on screen pulls nothing at all (plan §3.2).
    const stopGroupFeed = subscribeSocketEvent<GroupFeedChangedPayload>(
      socket,
      ticketSocketEvents.groupFeedChanged,
      () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          return;
        }
        debounced.trigger();
      },
    );
    return () => {
      debounced.cancel();
      stopUpdated();
      stopCreated();
      stopGroupFeed();
      releaseHelpdeskSocket();
    };
  }, [reload, session]);
}
