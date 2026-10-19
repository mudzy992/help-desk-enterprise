import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { localDayKey, queryKeys } from "@/lib/query/query-keys";
import type { DashboardSummary } from "@/lib/dashboard/compose-dashboard-summary";
import { useTicketCollectionRealtime } from "@/lib/realtime/use-ticket-collection-realtime";
import { useSession } from "@/lib/session/use-session";
import { invalidateDashboardQueries } from "@/lib/dashboard/invalidate-dashboard-queries";
import { loadDashboardPrimary } from "@/lib/dashboard/load-dashboard-primary";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { readApiRequestId } from "@/lib/map-api-error";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { listRoutingRules } from "@/services/routing-api";
import { listOfferedServices, listServices } from "@/services/service-catalog-api";
import { listGroupInboxPage, type TicketPage, type TicketResponse } from "@/services/tickets-api";
import type { ServiceResponse } from "@/services/service-catalog-api";
import type { RoutingRuleResponse } from "@/services/routing-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

export type DashboardSummaryState = {
  readonly isStaff: boolean;
  readonly summary: DashboardSummary | null;
  readonly inboxCount: number | null;
  readonly inboxTotalIsCapped: boolean;
  readonly inboxTickets: readonly TicketResponse[] | null;
  readonly isInboxLoading: boolean;
  readonly inboxErrorKey: TicketErrorKey | null;
  readonly inboxRequestId: string | null;
  readonly reloadInbox: () => Promise<void>;
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly isLoading: boolean;
  readonly errorKey: TicketErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

export function useDashboardSummary(isStaff: boolean): DashboardSummaryState {
  const { currentUserId } = useSession();
  // The counters carry a day ("opened today"), so the day is part of the key:
  // when it changes the callback identity changes with it and the effect below
  // fetches the new day instead of showing yesterday's payload.
  const dayKey = localDayKey();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [inboxPage, setInboxPage] = useState<TicketPage | null>(null);
  const [isInboxLoading, setIsInboxLoading] = useState(isStaff);
  const [inboxErrorKey, setInboxErrorKey] = useState<TicketErrorKey | null>(null);
  const [inboxRequestId, setInboxRequestId] = useState<string | null>(null);
  const [serviceNames, setServiceNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [originNames, setOriginNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [groupNames, setGroupNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const reloadInbox = useCallback(async () => {
    if (!isStaff) {
      setInboxPage(null);
      setIsInboxLoading(false);
      setInboxErrorKey(null);
      setInboxRequestId(null);
      return;
    }
    setIsInboxLoading(true);
    setInboxErrorKey(null);
    setInboxRequestId(null);
    try {
      const page = await queryClient.fetchQuery({
        queryKey: queryKeys.groupInbox,
        queryFn: () => listGroupInboxPage(),
      });
      setInboxPage(page);
    } catch (error) {
      setInboxPage(null);
      setInboxErrorKey(mapTicketError(error));
      setInboxRequestId(readApiRequestId(error));
    } finally {
      setIsInboxLoading(false);
    }
  }, [isStaff, queryClient]);

  const reload = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
        setErrorKey(null);
        setRequestId(null);
      }
      try {
        // Val 6.1 / modul 4 (D3): silent (realtime-driven) reloads always
        // invalidate the dashboard's React Query keys first so the next
        // fetchQuery does not return a <30s stale cache. Without this, a
        // ticket created/resolved within the staleTime window did not show
        // up until the cache expired.
        if (silent) {
          await invalidateDashboardQueries(queryClient);
        }

        // counters, card lists and the chart.
        // As soon as this Promise.all resolves the page can paint metrics,
        // charts, attention and recent tickets — `isLoading` is turned off
        // immediately after. Lookups (catalog, OU tree, routing rules) land
        // progressively in so they never block first paint.
        //
        // Val 6.1 / modul 4:
        //  - D2: SLA watchlist sorted by `slaDueAt` ascending (most breached
        //    first); no client-side re-sort.
        //  - D8: dedicated `critical-unassigned` query instead of relying on
        //    the top-8 by `updatedAt` from the generic unassigned page, so a
        //    critical ticket without an owner can never fall out of view.
        setSummary(await loadDashboardPrimary({ queryClient, dayKey, currentUserId, isStaff }));

        if (!silent) {
          setIsLoading(false);
        }

        // auxiliary lookups that do not block first
        // paint. Each catches independently so one failing lookup cannot blank
        // the whole dashboard.
        const [, catalog, tree, rules] = await Promise.all([
          reloadInbox(),
          queryClient
            .fetchQuery({
              queryKey: queryKeys.dashboardServiceNames,
              queryFn: () => listServices(),
            })
            .catch((): Promise<readonly ServiceResponse[]> =>
              queryClient
                .fetchQuery({
                  queryKey: queryKeys.offeredServices,
                  queryFn: () => listOfferedServices(),
                })
                .catch((): readonly ServiceResponse[] => []),
            ),
          queryClient
            .fetchQuery({
              queryKey: queryKeys.organizationalUnits,
              queryFn: () => listOrganizationalUnitTree(),
            })
            .catch((): readonly OrganizationalUnitTreeNode[] => []),
          isStaff
            ? queryClient
                .fetchQuery({
                  queryKey: queryKeys.routingRules,
                  queryFn: () => listRoutingRules(),
                })
                .catch((): readonly RoutingRuleResponse[] => [])
            : Promise.resolve([] as readonly RoutingRuleResponse[]),
        ]);
        setServiceNames(
          new Map(catalog.map((service: ServiceResponse) => [service.id, service.name])),
        );
        setOriginNames(flattenOrganizationalUnitNames(tree));
        setGroupNames(
          new Map(rules.map((rule: RoutingRuleResponse) => [rule.groupId, rule.groupName])),
        );
      } catch (error) {
        if (silent) {
          return;
        }
        setSummary(null);
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
    },
    [currentUserId, dayKey, isStaff, queryClient, reloadInbox],
  );

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
    inboxCount: inboxPage?.total ?? null,
    inboxTotalIsCapped: inboxPage?.totalIsCapped === true,
    inboxTickets: inboxPage?.items ?? null,
    isInboxLoading,
    inboxErrorKey,
    inboxRequestId,
    reloadInbox,
    serviceNames,
    originNames,
    groupNames,
    isLoading,
    errorKey,
    requestId,
    reload,
  };
}
