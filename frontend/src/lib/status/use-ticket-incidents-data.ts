import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import type { TranslationKey } from "@/i18n/translation-key";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { mapStatusError } from "@/lib/status/status-view";
import { listTicketIncidents, type Incident } from "@/services/status-api";

export type TicketIncidentsSnapshot = {
  readonly staff: boolean;
  readonly incidents: readonly Incident[];
};

export type TicketIncidentsError = {
  readonly key: TranslationKey;
  readonly requestId: string | null;
};

export function useTicketIncidentsData(ticketId: string, versionKey: string) {
  const [data, setData] = useState<TicketIncidentsSnapshot | null>(null);
  const [error, setError] = useState<TicketIncidentsError | null>(null);
  const [pending, setPending] = useState(false);
  const guard = useRef(createLatestRequestGuard());

  const reload = useCallback(async () => {
    const request = guard.current.begin();
    setPending(true);
    try {
      const loaded = await listTicketIncidents(ticketId);
      if (!guard.current.isCurrent(request)) return;
      setData(loaded);
      setError(null);
    } catch (caught) {
      if (!guard.current.isCurrent(request)) return;
      setError({
        key: mapStatusError(caught) ?? mapApiError(caught),
        requestId: readApiRequestId(caught),
      });
    } finally {
      if (guard.current.isCurrent(request)) setPending(false);
    }
  }, [ticketId]);

  useEffect(() => {
    setData(null);
    setError(null);
    void reload();
    const currentGuard = guard.current;
    return () => currentGuard.cancel();
  }, [reload, versionKey]);

  return { data, error, pending, reload };
}
