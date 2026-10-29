import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { fetchReportsDashboard, type ReportsDashboardResponse } from "@/services/reports-api";

export function useReportsDashboardData(input: {
  readonly active: boolean;
  readonly organizationalUnitId: string | null;
  readonly from: string | null;
  readonly to: string | null;
}) {
  const [dashboard, setDashboard] = useState<ReportsDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const guard = useRef(createLatestRequestGuard());

  const reload = useCallback(async () => {
    const request = guard.current.begin();
    if (input.organizationalUnitId === null || input.from === null || input.to === null) {
      setDashboard(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await fetchReportsDashboard({
        organizationalUnitId: input.organizationalUnitId,
        from: input.from,
        to: input.to,
      });
      if (guard.current.isCurrent(request)) setDashboard(loaded);
    } catch (caught) {
      if (!guard.current.isCurrent(request)) return;
      setDashboard(null);
      setError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    } finally {
      if (guard.current.isCurrent(request)) setIsLoading(false);
    }
  }, [input.from, input.organizationalUnitId, input.to]);

  useEffect(() => {
    const currentGuard = guard.current;
    if (input.active) void reload();
    return () => currentGuard.cancel();
  }, [input.active, reload]);

  return { dashboard, isLoading, error, reload };
}
