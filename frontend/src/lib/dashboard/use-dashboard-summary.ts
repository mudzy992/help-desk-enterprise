import { useCallback, useEffect, useState } from "react";
import {
  summarizeTickets,
  type DashboardSummary,
} from "@/lib/dashboard/summarize-tickets";
import { useSession } from "@/lib/session/use-session";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  listGroupInbox,
  listTickets,
  type TicketResponse,
} from "@/services/tickets-api";

export type DashboardSummaryState = {
  readonly summary: DashboardSummary | null;
  readonly inboxCount: number | null;
  readonly inboxTickets: readonly TicketResponse[] | null;
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly reload: () => Promise<void>;
};

export function useDashboardSummary(): DashboardSummaryState {
  const { currentUserId } = useSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [inboxTickets, setInboxTickets] = useState<
    readonly TicketResponse[] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const tickets = await listTickets();
      setSummary(summarizeTickets(tickets, currentUserId));
      // The group inbox is permission-scoped; absence of access is not an error.
      const inbox = await listGroupInbox().catch(() => null);
      setInboxTickets(inbox);
    } catch (error) {
      setSummary(null);
      setInboxTickets(null);
      setErrorKey(mapTicketError(error));
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    summary,
    inboxCount: inboxTickets === null ? null : inboxTickets.length,
    inboxTickets,
    isLoading,
    errorKey,
    reload,
  };
}
