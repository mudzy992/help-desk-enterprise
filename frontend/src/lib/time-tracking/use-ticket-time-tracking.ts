import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { markActiveTimerChanged, useActiveTimer } from "@/lib/time-tracking/active-timer-store";
import {
  isActiveElsewhere,
  mapTimeTrackingError,
  type TimeTrackingErrorKey,
} from "@/lib/time-tracking/map-time-tracking-error";
import {
  addManualTicketTimeLog,
  correctTicketTimeLog,
  deleteTicketTimeLog,
  listTicketTimeLogs,
  startTicketTimeLog,
  stopTicketTimeLog,
  type TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";

export type ManualEntryInput = {
  readonly startedAt: string;
  readonly durationMinutes: number;
  readonly note: string;
};

export type CorrectionInput = {
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly note?: string;
  readonly reason: string;
};

/**
 * Package 1.3: every time-entry action of the ticket screen. The list is re-read
 * after each mutation and whenever the shared active timer changes (idle pause,
 * switch from another ticket, header stop), so it never shows a stale timer.
 */
export function useTicketTimeTracking(input: {
  readonly ticketId: string | undefined;
  readonly setTimeLogs: Dispatch<SetStateAction<readonly TicketTimeLogResponse[]>>;
  readonly canManage: boolean;
}) {
  const { ticketId, setTimeLogs, canManage } = input;
  const { generation, timer, policy } = useActiveTimer();
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<TimeTrackingErrorKey | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState(false);
  // The first list comes with the ticket detail; re-read only on later changes.
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    if (ticketId === undefined) return;
    const rows = await listTicketTimeLogs(ticketId, {
      includeDeleted: canManage && showDeleted,
    }).catch(() => null);
    if (rows !== null) setTimeLogs(rows);
  }, [canManage, setTimeLogs, showDeleted, ticketId]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void reload();
  }, [generation, reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setIsSaving(true);
      setErrorKey(null);
      try {
        await action();
        await reload();
        await markActiveTimerChanged();
        return true;
      } catch (error) {
        setErrorKey(mapTimeTrackingError(error));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [reload],
  );

  return {
    policy,
    activeElsewhere: timer !== null && timer.ticketId !== ticketId ? timer : null,
    isSaving,
    errorKey,
    clearError: () => setErrorKey(null),
    showDeleted,
    setShowDeleted,
    canManage,
    switchPrompt,
    closeSwitchPrompt: () => setSwitchPrompt(false),
    start: async (switchFromActive = false) => {
      if (ticketId === undefined) return;
      setIsSaving(true);
      setErrorKey(null);
      try {
        await startTicketTimeLog(ticketId, { switchFromActive });
        setSwitchPrompt(false);
        await reload();
        await markActiveTimerChanged();
      } catch (error) {
        if (isActiveElsewhere(error)) {
          await markActiveTimerChanged();
          setSwitchPrompt(true);
        } else {
          setErrorKey(mapTimeTrackingError(error));
        }
      } finally {
        setIsSaving(false);
      }
    },
    stop: (timeLogId: string) =>
      ticketId === undefined ? Promise.resolve(false) : run(() => stopTicketTimeLog(ticketId, timeLogId)),
    addManual: (entry: ManualEntryInput) =>
      ticketId === undefined ? Promise.resolve(false) : run(() => addManualTicketTimeLog(ticketId, entry)),
    correct: (timeLogId: string, correction: CorrectionInput) =>
      ticketId === undefined
        ? Promise.resolve(false)
        : run(() => correctTicketTimeLog(ticketId, timeLogId, correction)),
    remove: (timeLogId: string, reason: string) =>
      ticketId === undefined
        ? Promise.resolve(false)
        : run(() => deleteTicketTimeLog(ticketId, timeLogId, reason)),
  };
}

export type TicketTimeTrackingControls = ReturnType<typeof useTicketTimeTracking>;
