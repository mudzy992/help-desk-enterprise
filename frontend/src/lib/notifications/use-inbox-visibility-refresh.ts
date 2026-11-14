import { useEffect, type RefObject } from "react";
import type { SocketHealth } from "@/lib/realtime/socket-health";

export function useInboxVisibilityRefresh(
  visible: boolean,
  socketHealth: SocketHealth,
  connectedBefore: RefObject<boolean>,
  refresh: () => Promise<void>,
): void {
  useEffect(() => {
    if (!visible || typeof document === "undefined") return;
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        socketHealth === "connected" &&
        connectedBefore.current
      ) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [visible, socketHealth, connectedBefore, refresh]);
}
