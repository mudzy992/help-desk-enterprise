import { useCallback, useEffect, useRef, useState } from "react";
import { mapTemplatesError, type TemplatesErrorKey } from "@/lib/templates/map-templates-error";
import {
  attachTicketPlaybook,
  detachTicketPlaybook,
  getTicketPlaybook,
  setTicketPlaybookStep,
  upgradeTicketPlaybook,
  type TicketPlaybookView,
} from "@/services/templates-api";

/**
 * Paket 1.4 (P2–P5): checklist state of one ticket. Reloads whenever the
 * ticket itself changes (`ticket.updated` in the room already refreshes the
 * ticket), so another agent's ticks show up without a dedicated event.
 */
export function useTicketPlaybook(ticketId: string | undefined, enabled: boolean, ticketVersion: string | undefined) {
  const [view, setView] = useState<TicketPlaybookView | null>(null);
  const [errorKey, setErrorKey] = useState<TemplatesErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const requestReference = useRef(0);

  const reload = useCallback(async () => {
    if (ticketId === undefined || !enabled) return;
    const request = ++requestReference.current;
    try {
      const next = await getTicketPlaybook(ticketId);
      if (request === requestReference.current) {
        setView(next);
        setErrorKey(null);
      }
    } catch (error) {
      if (request === requestReference.current) setErrorKey(mapTemplatesError(error));
    }
  }, [enabled, ticketId]);

  useEffect(() => {
    void reload();
  }, [reload, ticketVersion]);

  const run = useCallback(
    async (operation: () => Promise<TicketPlaybookView>): Promise<boolean> => {
      setBusy(true);
      setErrorKey(null);
      try {
        requestReference.current += 1;
        setView(await operation());
        return true;
      } catch (error) {
        setErrorKey(mapTemplatesError(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const setStep = useCallback(
    async (stepKey: string, checked: boolean) => {
      if (ticketId === undefined) return false;
      // Optimistic tick; the server view replaces it (or the error reverts it).
      setView((current) =>
        current?.playbook == null
          ? current
          : {
              ...current,
              playbook: {
                ...current.playbook,
                steps: current.playbook.steps.map((step) =>
                  step.stepKey === stepKey ? { ...step, checked } : step,
                ),
              },
            },
      );
      const ok = await run(() => setTicketPlaybookStep(ticketId, stepKey, checked));
      if (!ok) void reload();
      return ok;
    },
    [reload, run, ticketId],
  );

  return {
    view,
    errorKey,
    busy,
    reload,
    setStep,
    attach: (playbookId: string) =>
      ticketId === undefined ? Promise.resolve(false) : run(() => attachTicketPlaybook(ticketId, playbookId)),
    detach: (reason: string) =>
      ticketId === undefined ? Promise.resolve(false) : run(() => detachTicketPlaybook(ticketId, reason)),
    upgrade: () => (ticketId === undefined ? Promise.resolve(false) : run(() => upgradeTicketPlaybook(ticketId))),
  };
}

export type TicketPlaybookController = ReturnType<typeof useTicketPlaybook>;

/** P5: statuses whose change the playbook guard covers (mirrors the backend). */
export function isPlaybookGuardedTransition(from: string, to: string): boolean {
  if (from === to) return false;
  if (to === "RESOLVED") return true;
  return to === "CLOSED" && from !== "RESOLVED";
}
