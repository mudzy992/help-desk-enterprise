import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { queryKeys } from "@/lib/query/query-keys";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import { buildSlaExposureIndex, type SlaExposureIndex } from "@/lib/sla/sla-exposure-index";
import { fetchSlaSummary } from "@/services/report-summary-api";
import {
  fetchSlaCompliance,
  listSlaCalendars,
  listSlaProfileChanges,
  listSlaProfiles,
  listSlaRules,
  type BusinessHoursCalendar,
  type SlaChangeLogEntry,
  type SlaComplianceResponse,
  type SlaProfile,
  type SlaRule,
} from "@/services/sla-api";

export function useSlaPageData(organizationalUnitId: string | null, complianceActive = false) {
  const queryClient = useQueryClient();
  const [profiles, setProfiles] = useState<readonly SlaProfile[]>([]);
  const [calendars, setCalendars] = useState<readonly BusinessHoursCalendar[]>([]);
  const [rules, setRules] = useState<readonly SlaRule[]>([]);
  const [changes, setChanges] = useState<readonly SlaChangeLogEntry[]>([]);
  const [exposure, setExposure] = useState<SlaExposureIndex>(() => buildSlaExposureIndex(null));
  const [compliance, setCompliance] = useState<SlaComplianceResponse | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isComplianceLoading, setIsComplianceLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);
  const [complianceErrorKey, setComplianceErrorKey] = useState<SlaErrorKey | null>(null);
  const baseGuard = useRef(createLatestRequestGuard());
  const detailGuard = useRef(createLatestRequestGuard());
  const complianceGuard = useRef(createLatestRequestGuard());

  const setSelectedId = useCallback((id: string | null) => {
    setIsCreating(id === null);
    setSelectedIdState(id);
  }, []);
  const startCreate = useCallback(() => {
    setIsCreating(true);
    setSelectedIdState(null);
    setRules([]);
    setChanges([]);
  }, []);
  const clearSelection = useCallback(() => {
    setIsCreating(false);
    setSelectedIdState(null);
  }, []);

  const load = useCallback(async () => {
    const request = baseGuard.current.begin();
    setIsLoading(true);
    setErrorKey(null);
    try {
      const [profileItems, calendarItems, summary] = await Promise.all([
        listSlaProfiles(),
        listSlaCalendars(),
        queryClient.fetchQuery({ queryKey: queryKeys.slaSummary, queryFn: fetchSlaSummary }),
      ]);
      if (!baseGuard.current.isCurrent(request)) return;
      setProfiles(profileItems);
      setCalendars(calendarItems);
      setExposure(buildSlaExposureIndex(summary));
      setSelectedIdState((current) => current ?? profileItems[0]?.id ?? null);
    } catch (error) {
      if (baseGuard.current.isCurrent(request)) setErrorKey(mapSlaError(error));
    } finally {
      if (baseGuard.current.isCurrent(request)) setIsLoading(false);
    }
  }, [queryClient]);

  const reloadSelected = useCallback(async () => {
    if (isCreating || selectedId === null) {
      setRules([]);
      setChanges([]);
      return;
    }
    const request = detailGuard.current.begin();
    setIsDetailLoading(true);
    try {
      const [ruleItems, changeItems] = await Promise.all([
        listSlaRules(selectedId),
        listSlaProfileChanges(selectedId),
      ]);
      if (!detailGuard.current.isCurrent(request)) return;
      setRules(ruleItems);
      setChanges(changeItems);
    } catch (error) {
      if (detailGuard.current.isCurrent(request)) setErrorKey(mapSlaError(error));
    } finally {
      if (detailGuard.current.isCurrent(request)) setIsDetailLoading(false);
    }
  }, [isCreating, selectedId]);

  useEffect(() => {
    const guard = baseGuard.current;
    void load();
    return () => guard.cancel();
  }, [load]);
  useEffect(() => {
    const guard = detailGuard.current;
    void reloadSelected();
    return () => guard.cancel();
  }, [reloadSelected]);
  useEffect(() => {
    if (!complianceActive || organizationalUnitId === null) return;
    const guard = complianceGuard.current;
    const request = guard.begin();
    setCompliance(null);
    setComplianceErrorKey(null);
    setIsComplianceLoading(true);
    void fetchSlaCompliance({ organizationalUnitId, days: 30 })
      .then((value) => guard.isCurrent(request) && setCompliance(value))
      .catch((error: unknown) =>
        guard.isCurrent(request) ? setComplianceErrorKey(mapSlaError(error)) : undefined,
      )
      .finally(() => guard.isCurrent(request) && setIsComplianceLoading(false));
    return () => guard.cancel();
  }, [complianceActive, organizationalUnitId]);

  return {
    profiles,
    calendars,
    rules,
    changes,
    exposure,
    compliance,
    selectedId,
    selected: isCreating ? undefined : profiles.find((profile) => profile.id === selectedId),
    isLoading,
    isDetailLoading,
    isComplianceLoading,
    errorKey,
    complianceErrorKey,
    setErrorKey,
    setSelectedId,
    startCreate,
    clearSelection,
    load,
    reloadSelected,
  };
}
