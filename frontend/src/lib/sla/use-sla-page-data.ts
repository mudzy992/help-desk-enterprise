import { useCallback, useEffect, useState } from "react";
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
import { listTickets, type TicketResponse } from "@/services/tickets-api";

export function useSlaPageData() {
  const [profiles, setProfiles] = useState<readonly SlaProfile[]>([]);
  const [calendars, setCalendars] = useState<readonly BusinessHoursCalendar[]>([]);
  const [rules, setRules] = useState<readonly SlaRule[]>([]);
  const [changes, setChanges] = useState<readonly SlaChangeLogEntry[]>([]);
  const [tickets, setTickets] = useState<readonly TicketResponse[]>([]);
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
      const [profileItems, calendarItems, ticketItems, complianceData] =
        await Promise.all([
          listSlaProfiles(),
          listSlaCalendars(),
          listTickets(),
          fetchSlaCompliance({ days: 30 }),
        ]);
      setProfiles(profileItems);
      setCalendars(calendarItems);
      setTickets(ticketItems);
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
    tickets,
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
