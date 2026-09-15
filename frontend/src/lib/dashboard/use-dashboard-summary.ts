import { useCallback, useEffect, useState } from "react";
import {
  summarizeTickets,
  type DashboardSummary,
} from "@/lib/dashboard/summarize-tickets";
import { useTicketCollectionRealtime } from "@/lib/realtime/use-ticket-collection-realtime";
import { useSession } from "@/lib/session/use-session";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { listRoutingRules } from "@/services/routing-api";
import { listServices } from "@/services/service-catalog-api";
import {
  listGroupInbox,
  listTickets,
  type TicketResponse,
} from "@/services/tickets-api";

export type DashboardSummaryState = {
  readonly summary: DashboardSummary | null;
  readonly inboxCount: number | null;
  readonly inboxTickets: readonly TicketResponse[] | null;
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

export function useDashboardSummary(): DashboardSummaryState {
  const { currentUserId } = useSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [inboxTickets, setInboxTickets] = useState<
    readonly TicketResponse[] | null
  >(null);
  const [serviceNames, setServiceNames] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [originNames, setOriginNames] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [groupNames, setGroupNames] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setErrorKey(null);
      setRequestId(null);
    }
    try {
      const tickets = await listTickets();
      setSummary(summarizeTickets(tickets, currentUserId));
      const [inbox, catalog, tree, rules] = await Promise.all([
        listGroupInbox().catch(() => null),
        listServices().catch(() => []),
        listOrganizationalUnitTree().catch(() => []),
        listRoutingRules().catch(() => []),
      ]);
      setInboxTickets(inbox);
      setServiceNames(
        new Map(catalog.map((service) => [service.id, service.name])),
      );
      setOriginNames(flattenOrganizationalUnitNames(tree));
      setGroupNames(
        new Map(rules.map((rule) => [rule.groupId, rule.groupName])),
      );
    } catch (error) {
      if (silent) {
        return;
      }
      setSummary(null);
      setInboxTickets(null);
      setServiceNames(new Map());
      setOriginNames(new Map());
      setGroupNames(new Map());
      setErrorKey(mapTicketError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [currentUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reloadSilent = useCallback(async () => {
    await reload(true);
  }, [reload]);
  useTicketCollectionRealtime(reloadSilent);

  return {
    summary,
    inboxCount: inboxTickets === null ? null : inboxTickets.length,
    inboxTickets,
    serviceNames,
    originNames,
    groupNames,
    isLoading,
    errorKey,
    requestId,
    reload,
  };
}
