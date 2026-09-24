import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
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
import {
  buildSlaExposureIndex,
  type SlaExposureIndex,
} from "@/lib/sla/sla-exposure-index";
import { fetchSlaSummary } from "@/services/report-summary-api";

export function useSlaPageData() {
  const queryClient = useQueryClient();
  const [profiles, setProfiles] = useState<readonly SlaProfile[]>([]);
  const [calendars, setCalendars] = useState<readonly BusinessHoursCalendar[]>([]);
  const [rules, setRules] = useState<readonly SlaRule[]>([]);
  const [changes, setChanges] = useState<readonly SlaChangeLogEntry[]>([]);
  // Phase 2.4: the exposure numbers are served as aggregates; the screen keeps
  // only the lookup it renders from.
  const [exposure, setExposure] = useState<SlaExposureIndex>(
    () => buildSlaExposureIndex(null),
  );
  const [compliance, setCompliance] = useState<SlaComplianceResponse | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);

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
    setIsLoading(true);
    setErrorKey(null);
    try {
      const [profileItems, calendarItems, slaSummary, complianceData] =
        await Promise.all([
          listSlaProfiles(),
          listSlaCalendars(),
          queryClient.fetchQuery({
            queryKey: queryKeys.slaSummary,
            queryFn: () => fetchSlaSummary(),
          }),
          fetchSlaCompliance({ days: 30 }),
        ]);
      setProfiles(profileItems);
      setCalendars(calendarItems);
      setExposure(buildSlaExposureIndex(slaSummary));
      setCompliance(complianceData);
      if (isCreating) {
        setRules([]);
        setChanges([]);
        return;
      }
      const nextId = selectedId ?? profileItems[0]?.id ?? null;
      setSelectedIdState(nextId);
      if (nextId === null) {
        setRules([]);
        setChanges([]);
        return;
      }
      const [ruleItems, changeItems] = await Promise.all([
        listSlaRules(nextId),
        listSlaProfileChanges(nextId),
      ]);
      setRules(ruleItems);
      setChanges(changeItems);
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsLoading(false);
    }
  }, [isCreating, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    profiles,
    calendars,
    rules,
    changes,
    exposure,
    compliance,
    selectedId,
    selected: isCreating
      ? undefined
      : profiles.find((profile) => profile.id === selectedId),
    isLoading,
    errorKey,
    setErrorKey,
    setSelectedId,
    startCreate,
    clearSelection,
    load,
  };
}
