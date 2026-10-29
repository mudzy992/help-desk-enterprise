import { useCallback, useEffect, useRef, useState } from "react";
import { useVisibilityAwarePolling } from "@/lib/async/use-visibility-aware-polling";
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
  const mounted = useRef(true);

  const poll = useCallback(async () => {
    const result = await listTeamsSimulatorMessages(userId, scope);
    if (!mounted.current) return;
    setMessages(result.items);
    setRefreshErrorKey(null);
  }, [scope, userId]);

  const { refreshNow } = useVisibilityAwarePolling({
    poll,
    intervalMs: simulatorPollMs,
    enabled: active && userId.length > 0,
    telemetryKey: "teams.simulator_poll_failed",
    immediate: false,
    onError: (error) => {
      if (mounted.current) setRefreshErrorKey(mapTeamsError(error));
    },
  });

  useEffect(() => {
    mounted.current = true;
    setMessages([]);
    setRefreshErrorKey(null);
    if (active && userId.length > 0) void refreshNow();
    return () => {
      mounted.current = false;
    };
  }, [active, refreshNow, scope, userId]);

  return { messages, refreshErrorKey, refresh: refreshNow };
}
