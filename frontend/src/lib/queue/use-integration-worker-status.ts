import { useCallback, useEffect, useState } from "react";
import {
  getIntegrationWorkerStatus,
  type IntegrationWorkerStatus,
} from "@/services/integration-queue-api";

const workerStatusPollMilliseconds = 15_000;

export function useIntegrationWorkerStatus(enabled: boolean) {
  const [status, setStatus] = useState<IntegrationWorkerStatus>("unknown");

  const load = useCallback(async () => {
    if (!enabled) {
      setStatus("unknown");
      return;
    }
    try {
      const response = await getIntegrationWorkerStatus();
      setStatus(response.status);
    } catch {
      setStatus("unknown");
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    if (!enabled) {
      return;
    }
    const timer = setInterval(() => {
      void load();
    }, workerStatusPollMilliseconds);
    return () => clearInterval(timer);
  }, [enabled, load]);

  return status;
}
