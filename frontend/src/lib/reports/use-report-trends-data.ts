import { useEffect, useMemo, useState } from "react";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  readReportErrorCode,
  toTrendsQuery,
  type ReportTrendErrorCode,
  type TrendsViewState,
} from "@/lib/reports/report-trends-view";
import {
  fetchReportTrends,
  type ReportTrendsQuery,
  type ReportTrendsResponse,
} from "@/services/report-trends-api";

export type ReportTrendsLoadError = {
  readonly code: ReportTrendErrorCode | null;
  readonly key: ApiErrorKey;
  readonly requestId: string | null;
};

export function useReportTrendsData(
  state: TrendsViewState,
  organizationalUnitId: string | null,
  onLoaded?: (trends: ReportTrendsResponse | null) => void,
) {
  const [trends, setTrends] = useState<ReportTrendsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ReportTrendsLoadError | null>(null);
  const query = useMemo(
    () => (organizationalUnitId === null ? null : toTrendsQuery(state, organizationalUnitId)),
    [state, organizationalUnitId],
  );
  const queryKey = query === null ? null : JSON.stringify(query);

  useEffect(() => {
    if (query === null) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const currentQuery = JSON.parse(queryKey ?? "{}") as ReportTrendsQuery;
    setTrends(null);
    onLoaded?.(null);
    setIsLoading(true);
    setError(null);
    void fetchReportTrends(currentQuery)
      .then((loaded) => {
        if (cancelled) return;
        setTrends(loaded);
        onLoaded?.(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setTrends(null);
        onLoaded?.(null);
        setError({
          code: readReportErrorCode(caught),
          key: mapApiError(caught),
          requestId: readApiRequestId(caught),
        });
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [onLoaded, query, queryKey]);

  return { trends, isLoading, error, query };
}
