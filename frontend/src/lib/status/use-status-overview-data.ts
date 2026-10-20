import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import type { TranslationKey } from "@/i18n/translation-key";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { mapStatusError } from "@/lib/status/status-view";
import { getStatusOverview, type StatusPageOverview } from "@/services/status-api";

export type StatusOverviewError = {
  readonly key: TranslationKey;
  readonly requestId: string | null;
  readonly disabled: boolean;
};

export type StatusOverviewLoadResult = "applied" | "error" | "stale";

const refreshEveryMs = 60_000;

function queryError(error: unknown): StatusOverviewError {
  const statusKey = mapStatusError(error);
  return {
    key: statusKey ?? mapApiError(error),
    requestId: readApiRequestId(error),
    disabled: statusKey === "status.errors.disabled",
  };
}

/** Owns status overview identity, stale-data recovery and visibility-aware polling. */
export function useStatusOverviewData() {
  const [overview, setOverview] = useState<StatusPageOverview | null>(null);
  const [error, setError] = useState<StatusOverviewError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const guard = useRef(createLatestRequestGuard());

  const reload = useCallback(async (): Promise<StatusOverviewLoadResult> => {
    const request = guard.current.begin();
    setRefreshing(true);
    try {
      const loaded = await getStatusOverview();
      if (!guard.current.isCurrent(request)) return "stale";
      setOverview(loaded);
      setError(null);
      setNowMs(Date.now());
      return "applied";
    } catch (caught) {
      if (!guard.current.isCurrent(request)) return "stale";
      setError(queryError(caught));
      return "error";
    } finally {
      if (guard.current.isCurrent(request)) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, refreshEveryMs);
    const currentGuard = guard.current;
    return () => {
      window.clearInterval(timer);
      currentGuard.cancel();
    };
  }, [reload]);

  return {
    overview,
    error,
    refreshing,
    nowMs,
    reload,
  };
}
