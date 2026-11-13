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
    const socket = acquireHelpdeskSocket();
    let pending = false;
    const isVisible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";
    const debounced = scheduleDebouncedCallback(() => {
      if (!isVisible()) {
        pending = true;
        return;
      }
      pending = false;
      void reload();
    }, collectionReloadDebounceMs);
    const scheduleRefresh = () => {
      if (!isVisible()) {
        pending = true;
        return;
      }
      debounced.trigger();
    };
    const stopConnect = subscribeSocketEvent(socket, "connect", scheduleRefresh);
    const onVisibilityChange = () => {
      if (pending && isVisible()) scheduleRefresh();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    const stopUpdated = subscribeSocketEvent<TicketUpdatedRealtimePayload>(
      socket,
      ticketSocketEvents.ticketUpdated,
      (payload) => {
        if (!shouldInvalidateTicketCollectionFromUpdated(payload)) {
          return;
        }
        scheduleRefresh();
      },
    );
    const stopCreated = subscribeSocketEvent<NotificationRealtimePayload>(
      socket,
      ticketSocketEvents.notificationCreated,
      (payload) => {
        if (!shouldInvalidateTicketCollectionFromNotification(payload)) {
          return;
        }
        scheduleRefresh();
      },
    );
    // Hidden tabs remember invalidation and refresh once when visible again.
    const stopGroupFeed = subscribeSocketEvent<GroupFeedChangedPayload>(
      socket,
      ticketSocketEvents.groupFeedChanged,
      () => {
        scheduleRefresh();
      },
    );
    return () => {
      debounced.cancel();
      stopConnect();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      stopUpdated();
      stopCreated();
      stopGroupFeed();
      releaseHelpdeskSocket();
    };
  }, [reload, session]);
}
