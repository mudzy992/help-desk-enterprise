import { useCallback, useEffect, useState } from "react";
import {
  getIntegrationWorkerStatus,
  type IntegrationWorkerStatus,
} from "@/services/integration-queue-api";

export interface IntegrationWorkerStatusState {
  readonly status: IntegrationWorkerStatus;
  readonly backlog: {
    readonly status: "available" | "unknown";
    readonly oldestCreatedAt: string | null;
  };
  readonly isRefreshing: boolean;
  readonly refresh: () => Promise<void>;
}

/**
 * Worker health for the integration queue card.
 *
 * The card reads process liveness and the separate backlog observation on mount
 * and when the user asks for it. The process heartbeat is not a delivery check.
 *
 * The socket is deliberately not used here: the queue card is an admin view and its
 * channel is not part of the realtime contract, so nothing new is emitted for it.
 */
export function useIntegrationWorkerStatus(enabled: boolean): IntegrationWorkerStatusState {
  const [status, setStatus] = useState<IntegrationWorkerStatus>("unknown");
  const [backlog, setBacklog] = useState<IntegrationWorkerStatusState["backlog"]>({
    status: "unknown",
    oldestCreatedAt: null,
  });
  const [isRefreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus("unknown");
      setBacklog({ status: "unknown", oldestCreatedAt: null });
      return;
    }
    setRefreshing(true);
    try {
      const response = await getIntegrationWorkerStatus();
      setStatus(response.status);
      setBacklog(response.dispatchableBacklog ?? { status: "unknown", oldestCreatedAt: null });
    } catch {
      setStatus("unknown");
      setBacklog({ status: "unknown", oldestCreatedAt: null });
    } finally {
      setRefreshing(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, backlog, isRefreshing, refresh };
}
