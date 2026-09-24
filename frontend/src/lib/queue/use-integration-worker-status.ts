import { useCallback, useEffect, useState } from "react";
import {
  getIntegrationWorkerStatus,
  type IntegrationWorkerStatus,
} from "@/services/integration-queue-api";

export interface IntegrationWorkerStatusState {
  readonly status: IntegrationWorkerStatus;
  readonly isRefreshing: boolean;
  readonly refresh: () => Promise<void>;
}

/**
 * Worker health for the integration queue card.
 *
 * Phase 4.1 (plan §4.1): this used to poll `/integration-jobs/worker-status` every
 * 15 seconds for as long as the card was open. The heartbeat is now written by a
 * worker job (one write per interval, not one per worker), and the card pulls the
 * status on mount and when the user asks for it — no interval, no traffic for a
 * screen nobody is looking at.
 *
 * The socket is deliberately not used here: the queue card is an admin view and its
 * channel is not part of the realtime contract, so nothing new is emitted for it.
 */
export function useIntegrationWorkerStatus(
  enabled: boolean,
): IntegrationWorkerStatusState {
  const [status, setStatus] = useState<IntegrationWorkerStatus>("unknown");
  const [isRefreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus("unknown");
      return;
    }
    setRefreshing(true);
    try {
      const response = await getIntegrationWorkerStatus();
      setStatus(response.status);
    } catch {
      setStatus("unknown");
    } finally {
      setRefreshing(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, isRefreshing, refresh };
}
