import { useCallback, useEffect, useRef, useState } from "react";
import { mapTeamsError, type TeamsErrorKey } from "@/lib/teams/map-teams-error";
import {
  listTeamsSimulatorMessages,
  type TeamsSimulatorMessage,
  type TeamsSimulatorScope,
} from "@/services/teams-api";

const simulatorPollMs = 4_000;

export function useTeamsSimulator(
  userId: string,
  scope: TeamsSimulatorScope,
  active = true,
): {
  readonly messages: readonly TeamsSimulatorMessage[];
  readonly refreshErrorKey: TeamsErrorKey | null;
  readonly refresh: () => Promise<void>;
} {
  const [messages, setMessages] = useState<readonly TeamsSimulatorMessage[]>([]);
  const [refreshErrorKey, setRefreshErrorKey] = useState<TeamsErrorKey | null>(null);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!active || !userId || document.visibilityState === "hidden" || refreshInFlight.current)
      return;
    refreshInFlight.current = true;
    try {
      const result = await listTeamsSimulatorMessages(userId, scope);
      setMessages(result.items);
      setRefreshErrorKey(null);
    } catch (error) {
      setRefreshErrorKey(mapTeamsError(error));
    } finally {
      refreshInFlight.current = false;
    }
  }, [active, scope, userId]);

  useEffect(() => {
    setMessages([]);
    setRefreshErrorKey(null);
    if (!active || !userId) return undefined;
    void refresh();
    const timer = window.setInterval(() => void refresh(), simulatorPollMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, refresh, userId]);

  return { messages, refreshErrorKey, refresh };
}
