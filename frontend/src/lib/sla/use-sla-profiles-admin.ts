import { useCallback, useEffect, useState } from "react";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import {
  listSlaCalendars,
  listSlaProfileChanges,
  listSlaProfiles,
  listSlaRules,
  type BusinessHoursCalendar,
  type SlaChangeLogEntry,
  type SlaProfile,
  type SlaRule,
} from "@/services/sla-api";

export function useSlaProfilesAdmin() {
  const [profiles, setProfiles] = useState<readonly SlaProfile[]>([]);
  const [calendars, setCalendars] = useState<readonly BusinessHoursCalendar[]>([]);
  const [rules, setRules] = useState<readonly SlaRule[]>([]);
  const [changes, setChanges] = useState<readonly SlaChangeLogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const [profileItems, calendarItems] = await Promise.all([
        listSlaProfiles(),
        listSlaCalendars(),
      ]);
      setProfiles(profileItems);
      setCalendars(calendarItems);
      const nextId = selectedId ?? profileItems[0]?.id ?? null;
      setSelectedId(nextId);
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
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    profiles,
    calendars,
    rules,
    changes,
    selectedId,
    selected: profiles.find((profile) => profile.id === selectedId),
    isLoading,
    errorKey,
    setErrorKey,
    setSelectedId,
    load,
  };
}
