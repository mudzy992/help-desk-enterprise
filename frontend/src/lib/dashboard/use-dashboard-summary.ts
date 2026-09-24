import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { localDayKey, queryKeys } from "@/lib/query/query-keys";
import {
  composeDashboardSummary,
  type DashboardSummary,
} from "@/lib/dashboard/compose-dashboard-summary";
import { useTicketCollectionRealtime } from "@/lib/realtime/use-ticket-collection-realtime";
import { isTicketStaff } from "@/lib/session/route-access";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { listRoutingRules } from "@/services/routing-api";
import { listOfferedServices, listServices } from "@/services/service-catalog-api";
import { fetchDashboardSummary } from "@/services/report-summary-api";
import {
  listGroupInbox,
  listTicketsPage,
  type TicketResponse,
} from "@/services/tickets-api";

export type DashboardSummaryState = {
  readonly isStaff: boolean;
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
  // The counters carry a day ("opened today"), so the day is part of the key:
  // when it changes the callback identity changes with it and the effect below
  // fetches the new day instead of showing yesterday's payload.
  const dayKey = localDayKey();
  const queryClient = useQueryClient();
  const isStaff = isTicketStaff(useSessionCapabilities());
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
      // Phase 2.4: the counters come from the server aggregate (SQL over the
      // same visibility scope as the lists); the first page is only the view
      // data of the recent/watch/attention lists and the 14-day chart.
      const [counts, firstPage] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.dashboardSummary("all", dayKey),
          queryFn: () => fetchDashboardSummary("all"),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.ticketList({ pageSize: 50 }),
          queryFn: () => listTicketsPage({ pageSize: 50 }),
        }),
      ]);
      setSummary(
        composeDashboardSummary({
          counts,
          tickets: firstPage.items,
          currentUserId,
        }),
      );
      const [inbox, catalog, tree, rules] = await Promise.all([
        isStaff
          ? queryClient
              .fetchQuery({
                queryKey: queryKeys.groupInbox,
                queryFn: () => listGroupInbox(),
              })
              .catch(() => null)
          : Promise.resolve(null),
        queryClient
          .fetchQuery({
            queryKey: queryKeys.services,
            queryFn: () => listServices(),
          })
          .catch(() =>
            queryClient
              .fetchQuery({
                queryKey: queryKeys.offeredServices,
                queryFn: () => listOfferedServices(),
              })
              .catch(() => []),
          ),
        queryClient
          .fetchQuery({
            queryKey: queryKeys.organizationalUnits,
            queryFn: () => listOrganizationalUnitTree(),
          })
          .catch(() => []),
        isStaff
          ? queryClient
              .fetchQuery({
                queryKey: queryKeys.routingRules,
                queryFn: () => listRoutingRules(),
              })
              .catch(() => [])
          : Promise.resolve([]),
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
  }, [currentUserId, dayKey, isStaff, queryClient]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reloadSilent = useCallback(async () => {
    await reload(true);
  }, [reload]);
  useTicketCollectionRealtime(reloadSilent);

  return {
    isStaff,
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
