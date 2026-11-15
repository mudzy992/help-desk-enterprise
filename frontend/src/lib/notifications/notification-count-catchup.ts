import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { reportClientError } from "@/lib/app/client-logger";
import { readApiRequestId } from "@/lib/map-api-error";
import { scheduleDebouncedCallback } from "@/lib/realtime/schedule-debounced-callback";
import {
  nextUnreadCount,
  type NotificationRealtimePayload,
} from "@/lib/realtime/apply-notification-realtime";

/** Socket counts are optimistic hints; coalesce bursts into an authoritative REST read. */
export function createNotificationCountCatchup(
  refresh: () => Promise<void>,
  revision: MutableRefObject<number>,
  setCount: Dispatch<SetStateAction<number>>,
) {
  const scheduled = scheduleDebouncedCallback(() => {
    void refresh().catch((error) =>
      reportClientError(
        "notifications.unread_event_refresh_failed",
        error,
        readApiRequestId(error),
      ),
    );
  }, 300);
  return {
    apply: (payload: NotificationRealtimePayload) => {
      revision.current += 1;
      setCount((current) => nextUnreadCount(current, payload));
      scheduled.trigger();
    },
    cancel: scheduled.cancel,
  };
}
