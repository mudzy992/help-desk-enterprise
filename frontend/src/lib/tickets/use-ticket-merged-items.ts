import { useCallback, useEffect, useState } from "react";
import { reportClientError } from "@/lib/app/client-logger";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { listMergedTickets, type MergedTicketItem } from "@/services/tickets-merge-api";

export function useTicketMergedItems(
  ticketId: string | null,
  revisionKey: string,
  enabled: boolean,
) {
  const [items, setItems] = useState<readonly MergedTicketItem[]>([]);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (ticketId === null || !enabled) {
      setItems([]);
      setErrorKey(null);
      return;
    }
    let cancelled = false;
    setItems([]);
    setErrorKey(null);
    void listMergedTickets(ticketId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setItems([]);
        setErrorKey(mapTicketError(error));
        reportClientError("ticket_merged_list_failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, retryToken, revisionKey, ticketId]);

  const retry = useCallback(() => setRetryToken((current) => current + 1), []);
  return { items, errorKey, retry };
}
