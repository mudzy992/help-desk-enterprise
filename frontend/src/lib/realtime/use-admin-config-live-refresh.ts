import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  subscribeAdminConfigEvents,
  subscribeAdminConfigReconnect,
  type AdminConfigDomain,
  type AdminConfigUpdatedEvent,
} from "@/lib/realtime/admin-config-events";

/** Keep potentially unsaved forms intact; an explicit refresh is required. */
export function useAdminConfigLiveRefresh(input: {
  readonly domains: readonly AdminConfigDomain[];
  readonly reload: () => unknown;
  readonly containerRef: RefObject<HTMLElement | null>;
}) {
  const [pending, setPending] = useState<AdminConfigUpdatedEvent | null>(null);
  const reloadRef = useRef(input.reload);
  reloadRef.current = input.reload;
  const domainsKey = input.domains.join(",");

  useEffect(() => {
    const domains = new Set(domainsKey.split(","));
    const stop = subscribeAdminConfigEvents((event) => {
      if (domains.has(event.domain)) setPending(event);
    });
    const stopReconnect = subscribeAdminConfigReconnect(() => {
      const domain = domainsKey.split(",")[0] as AdminConfigDomain | undefined;
      if (domain)
        setPending(
          (current) =>
            current ?? {
              domain,
              action: "update",
              actorUserId: null,
              actorName: null,
              occurredAt: new Date().toISOString(),
              reason: "reconnect",
            },
        );
    });
    return () => {
      stop();
      stopReconnect();
    };
  }, [domainsKey]);

  const refreshNow = useCallback(() => {
    setPending(null);
    void reloadRef.current();
  }, []);
  const dismiss = useCallback(() => setPending(null), []);
  return { pending, refreshNow, dismiss };
}
