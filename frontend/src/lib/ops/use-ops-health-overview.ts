import { useCallback, useEffect, useRef, useState } from "react";
import { useVisibilityAwarePolling } from "@/lib/async/use-visibility-aware-polling";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { getOpsOverview, type OpsOverview } from "@/services/ops-health-api";

/** The worker measures once a minute; refreshing faster only adds load. */
const refreshEveryMs = 30_000;

export type OpsHealthLoadError = {
  readonly key: ApiErrorKey;
  readonly requestId: string | null;
};

/** Owns polling and the non-destructive overview refresh contract. */
export function useOpsHealthOverview() {
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [loadError, setLoadError] = useState<OpsHealthLoadError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    if (mounted.current) setRefreshing(true);
    try {
      const next = await getOpsOverview();
      if (!mounted.current) return;
      setOverview(next);
      setLoadError(null);
      setNowMs(Date.now());
      return true;
    } catch (caught) {
      if (!mounted.current) return;
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useVisibilityAwarePolling({
    poll: async () => {
      if (!(await load())) throw new Error("Ops health polling failed");
    },
    intervalMs: refreshEveryMs,
    telemetryKey: "ops.health_poll_failed",
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return { overview, loadError, refreshing, nowMs, load };
}
