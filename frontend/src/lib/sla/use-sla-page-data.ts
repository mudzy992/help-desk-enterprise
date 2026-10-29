import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { readApiRequestId } from "@/lib/map-api-error";
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

export type SlaQueryError = {
  readonly key: SlaErrorKey;
  readonly requestId: string | null;
};

const toQueryError = (error: unknown): SlaQueryError => ({
  key: mapSlaError(error),
  requestId: readApiRequestId(error),
});

export function useSlaPageData(organizationalUnitId: string | null, complianceActive = false) {
  const queryClient = useQueryClient();
  const [profiles, setProfiles] = useState<readonly SlaProfile[]>([]);
  const [calendars, setCalendars] = useState<readonly BusinessHoursCalendar[]>([]);
  const [rules, setRules] = useState<readonly SlaRule[]>([]);
  const [changes, setChanges] = useState<readonly SlaChangeLogEntry[]>([]);
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);
  const [exposure, setExposure] = useState<SlaExposureIndex>(() => buildSlaExposureIndex(null));
  const [compliance, setCompliance] = useState<SlaComplianceResponse | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isComplianceLoading, setIsComplianceLoading] = useState(false);
  const [baseError, setBaseError] = useState<SlaQueryError | null>(null);
  const [detailError, setDetailError] = useState<SlaQueryError | null>(null);
  const [complianceError, setComplianceError] = useState<SlaQueryError | null>(null);
  const [mutationError, setMutationError] = useState<SlaQueryError | null>(null);
  const baseGuard = useRef(createLatestRequestGuard());
  const detailGuard = useRef(createLatestRequestGuard());
  const complianceGuard = useRef(createLatestRequestGuard());

  const setSelectedId = useCallback((id: string | null) => {
    setIsCreating(id === null);
    setSelectedIdState(id);
    setDetailError(null);
  }, []);
  const startCreate = useCallback(() => {
    setIsCreating(true);
    setSelectedIdState(null);
    setRules([]);
    setChanges([]);
    setDetailProfileId(null);
    setDetailError(null);
  }, []);
  const clearSelection = useCallback(() => {
    setIsCreating(false);
    setSelectedIdState(null);
    setDetailProfileId(null);
    setDetailError(null);
  }, []);

  const load = useCallback(async () => {
    const request = baseGuard.current.begin();
    setIsLoading(true);
    setBaseError(null);
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
      if (baseGuard.current.isCurrent(request)) setBaseError(toQueryError(error));
    } finally {
      if (baseGuard.current.isCurrent(request)) setIsLoading(false);
    }
  }, [queryClient]);

  const reloadSelected = useCallback(async () => {
    if (isCreating || selectedId === null) {
      setRules([]);
      setChanges([]);
      setDetailProfileId(null);
      setDetailError(null);
      return;
    }
    const profileId = selectedId;
    const request = detailGuard.current.begin();
    setIsDetailLoading(true);
    setDetailError(null);
    try {
      const [ruleItems, changeItems] = await Promise.all([
        listSlaRules(profileId),
        listSlaProfileChanges(profileId),
      ]);
      if (!detailGuard.current.isCurrent(request)) return;
      setRules(ruleItems);
      setChanges(changeItems);
      setDetailProfileId(profileId);
    } catch (error) {
      if (detailGuard.current.isCurrent(request)) setDetailError(toQueryError(error));
    } finally {
      if (detailGuard.current.isCurrent(request)) setIsDetailLoading(false);
    }
  }, [isCreating, selectedId]);

  const reloadCompliance = useCallback(async () => {
    if (!complianceActive || organizationalUnitId === null) return;
    const request = complianceGuard.current.begin();
    setCompliance(null);
    setComplianceError(null);
    setIsComplianceLoading(true);
    try {
      const value = await fetchSlaCompliance({ organizationalUnitId, days: 30 });
      if (complianceGuard.current.isCurrent(request)) setCompliance(value);
    } catch (error) {
      if (complianceGuard.current.isCurrent(request)) setComplianceError(toQueryError(error));
    } finally {
      if (complianceGuard.current.isCurrent(request)) setIsComplianceLoading(false);
    }
  }, [complianceActive, organizationalUnitId]);

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
    const guard = complianceGuard.current;
    void reloadCompliance();
    return () => guard.cancel();
  }, [reloadCompliance]);

  const selected = isCreating ? undefined : profiles.find((profile) => profile.id === selectedId);
  const detailReady = isCreating || (selectedId !== null && detailProfileId === selectedId);
  const setErrorKey = useCallback((key: SlaErrorKey | null) => {
    setMutationError(key === null ? null : { key, requestId: null });
  }, []);

  return {
    profiles,
    calendars,
    rules,
    changes,
    exposure,
    compliance,
    selectedId,
    selected,
    detailProfileId,
    detailReady,
    isCreating,
    isLoading,
    isDetailLoading,
    isComplianceLoading,
    baseError,
    detailError,
    complianceError,
    mutationError,
    errorKey: mutationError?.key ?? null,
    complianceErrorKey: complianceError?.key ?? null,
    setErrorKey,
    setMutationError,
    setSelectedId,
    startCreate,
    clearSelection,
    load,
    reloadSelected,
    reloadCompliance,
  };
}
