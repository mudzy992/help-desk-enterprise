import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { listReportScheduleRuns, type ReportScheduleRun } from "@/services/report-schedules-api";

export function useReportScheduleRuns(scheduleId: string | null) {
  const [runs, setRuns] = useState<readonly ReportScheduleRun[] | null>(null);
  const [error, setError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadGuard = useRef(createLatestRequestGuard());

  const load = useCallback(async () => {
    if (scheduleId === null) return;
    const request = loadGuard.current.begin();
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await listReportScheduleRuns(scheduleId);
      if (loadGuard.current.isCurrent(request)) setRuns(loaded.runs);
    } catch (caught) {
      if (loadGuard.current.isCurrent(request)) {
        setError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
      }
    } finally {
      if (loadGuard.current.isCurrent(request)) setIsLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    const guard = loadGuard.current;
    setRuns(null);
    void load();
    return () => guard.cancel();
  }, [load]);

  return { runs, error, isLoading, load };
}
