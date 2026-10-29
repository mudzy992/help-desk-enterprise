import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { listGroups } from "@/services/groups-api";
import { listServices } from "@/services/service-catalog-api";

export type ReportFilterOption = { readonly id: string; readonly label: string };
export type ReportFilterError = { readonly key: ApiErrorKey; readonly requestId: string | null };

export function useReportFilterOptions(enabled: boolean, language: string) {
  const [services, setServices] = useState<readonly ReportFilterOption[]>([]);
  const [groups, setGroups] = useState<readonly ReportFilterOption[]>([]);
  const [serviceError, setServiceError] = useState<ReportFilterError | null>(null);
  const [groupError, setGroupError] = useState<ReportFilterError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const guard = useRef(createLatestRequestGuard());

  const load = useCallback(async () => {
    if (!enabled) return;
    const request = guard.current.begin();
    setIsLoading(true);
    setServiceError(null);
    setGroupError(null);
    const [serviceResult, groupResult] = await Promise.allSettled([listServices(), listGroups()]);
    if (!guard.current.isCurrent(request)) return;
    if (serviceResult.status === "fulfilled") {
      setServices(
        serviceResult.value
          .map((service) => ({ id: service.id, label: service.name }))
          .sort((a, b) => a.label.localeCompare(b.label, language)),
      );
    } else {
      setServiceError({
        key: mapApiError(serviceResult.reason),
        requestId: readApiRequestId(serviceResult.reason),
      });
    }
    if (groupResult.status === "fulfilled") {
      setGroups(
        groupResult.value
          .map((group) => ({ id: group.id, label: group.name }))
          .sort((a, b) => a.label.localeCompare(b.label, language)),
      );
    } else {
      setGroupError({
        key: mapApiError(groupResult.reason),
        requestId: readApiRequestId(groupResult.reason),
      });
    }
    setIsLoading(false);
  }, [enabled, language]);

  useEffect(() => {
    const current = guard.current;
    void load();
    return () => current.cancel();
  }, [load]);

  return { services, groups, serviceError, groupError, isLoading, load };
}
