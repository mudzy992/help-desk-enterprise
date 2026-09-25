import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  isEditingWithin,
  subscribeAdminConfigEvents,
  type AdminConfigDomain,
  type AdminConfigUpdatedEvent,
} from "@/lib/realtime/admin-config-events";
import { useSession } from "@/lib/session/use-session";

/**
 * Paket 1.7 (R3). Another admin changed a domain this screen shows:
 * - screen visible and nobody editing → silent reload;
 * - admin is editing → keep the screen, expose `pending` for the banner;
 * - screen hidden → reload once when it becomes visible again.
 * Own changes are ignored (the screen already reloaded after its own save).
 */
export function useAdminConfigLiveRefresh(input: {
  readonly domains: readonly AdminConfigDomain[];
  readonly reload: () => unknown;
  readonly containerRef: RefObject<HTMLElement | null>;
}) {
  const { currentUserId } = useSession();
  const [pending, setPending] = useState<AdminConfigUpdatedEvent | null>(null);
  const reloadRef = useRef(input.reload);
  reloadRef.current = input.reload;
  const staleWhileHidden = useRef(false);
  const domainsKey = input.domains.join(",");

  useEffect(() => {
    const domains = new Set(domainsKey.split(","));
    const stop = subscribeAdminConfigEvents((event) => {
      if (!domains.has(event.domain)) return;
      if (event.actorUserId !== null && event.actorUserId === currentUserId) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        staleWhileHidden.current = true;
        return;
      }
      if (isEditingWithin(input.containerRef.current)) {
        setPending(event);
        return;
      }
      void reloadRef.current();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible" && staleWhileHidden.current) {
        staleWhileHidden.current = false;
        void reloadRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentUserId, domainsKey, input.containerRef]);

  const refreshNow = useCallback(() => {
    setPending(null);
    void reloadRef.current();
  }, []);
  const dismiss = useCallback(() => setPending(null), []);
  return { pending, refreshNow, dismiss };
}
