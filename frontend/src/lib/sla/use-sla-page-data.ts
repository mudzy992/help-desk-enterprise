import { useCallback, useEffect, useState } from "react";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import { readBooleanSetting } from "@/lib/settings/read-setting-entry";
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
import { getSettingsRegistry } from "@/services/settings-api";
import { listTickets, type TicketResponse } from "@/services/tickets-api";

const PAUSE_WAITING_KEY = "private.ticket.sla.pauseOnWaitingForUser";
const PAUSE_APPROVAL_KEY = "private.ticket.sla.pauseOnPendingApproval";

export type SlaPauseSettings = {
  readonly pauseOnWaitingForUser: boolean;
  readonly pauseOnPendingApproval: boolean;
};

export function useSlaPageData() {
  const [profiles, setProfiles] = useState<readonly SlaProfile[]>([]);
  const [calendars, setCalendars] = useState<readonly BusinessHoursCalendar[]>([]);
  const [rules, setRules] = useState<readonly SlaRule[]>([]);
  const [changes, setChanges] = useState<readonly SlaChangeLogEntry[]>([]);
  const [tickets, setTickets] = useState<readonly TicketResponse[]>([]);
  const [compliance, setCompliance] = useState<SlaComplianceResponse | null>(null);
  const [pauses, setPauses] = useState<SlaPauseSettings>({
    pauseOnWaitingForUser: true,
    pauseOnPendingApproval: true,
  });
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
      const [profileItems, calendarItems, ticketItems, complianceData, settings] =
        await Promise.all([
          listSlaProfiles(),
          listSlaCalendars(),
          listTickets(),
          fetchSlaCompliance({ days: 30 }),
          getSettingsRegistry(),
        ]);
      setProfiles(profileItems);
      setCalendars(calendarItems);
      setTickets(ticketItems);
      setCompliance(complianceData);
      setPauses({
        pauseOnWaitingForUser: readBooleanSetting(settings, PAUSE_WAITING_KEY, true),
        pauseOnPendingApproval: readBooleanSetting(settings, PAUSE_APPROVAL_KEY, true),
      });
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
    pauses,
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
