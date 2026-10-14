import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { localDayKey, queryKeys } from "@/lib/query/query-keys";
import {
  composeDashboardSummary,
  dashboardRecentTicketLimit,
  type DashboardSummary,
} from "@/lib/dashboard/compose-dashboard-summary";
import {
  dashboardAttentionTicketLimit,
  dashboardOpenStatuses,
  dashboardSlaWatchlistLimit,
} from "@/lib/dashboard/dashboard-ticket-sets";
import { dashboardVolumeDayCount } from "@/lib/dashboard/build-volume-14d";
import { loadDashboardVolume } from "@/lib/dashboard/load-dashboard-volume";
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
import { listGroupInbox, listTicketsPage, type TicketResponse } from "@/services/tickets-api";
import type { ServiceResponse } from "@/services/service-catalog-api";
import type { RoutingRuleResponse } from "@/services/routing-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

/** Početak lokalne civilne noći 13 dana prije `now` (prvi dan grafikona). */
function dashboardVolumeWindowStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dashboardVolumeDayCount - 1));
}

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

export function useDashboardSummary(isStaffInput?: boolean): DashboardSummaryState {
  const { currentUserId } = useSession();
  // Val 6.1 / modul 4 (D14): a single source of session capabilities per
  // dashboard render. The page already calls `useSessionCapabilities` for the
  // reports button, so it passes the resolved boolean in; when omitted (e.g.
  // in tests) we still resolve it here.
  const capabilities = useSessionCapabilities();
  const isStaff = isStaffInput ?? isTicketStaff(capabilities);
  // The counters carry a day ("opened today"), so the day is part of the key:
  // when it changes the callback identity changes with it and the effect below
  // fetches the new day instead of showing yesterday's payload.
  const dayKey = localDayKey();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [inboxTickets, setInboxTickets] = useState<readonly TicketResponse[] | null>(null);
  const [serviceNames, setServiceNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [originNames, setOriginNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [groupNames, setGroupNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

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
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummaryPrefix }),
            queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists }),
            queryClient.invalidateQueries({ queryKey: queryKeys.groupInbox }),
          ]);
        }

        // Phase 1 (critical path, D6): counters, card lists and the chart.
        // As soon as this Promise.all resolves the page can paint metrics,
        // charts, attention and recent tickets — `isLoading` is turned off
        // immediately after. Lookups (catalog, OU tree, routing rules) land
        // progressively in phase 2 so they never block first paint.
        //
        // Val 6.1 / modul 4:
        //  - D2: SLA watchlist sorted by `slaDueAt` ascending (most breached
        //    first); no client-side re-sort.
        //  - D8: dedicated `critical-unassigned` query instead of relying on
        //    the top-8 by `updatedAt` from the generic unassigned page, so a
        //    critical ticket without an owner can never fall out of view.
        const volumeStart = dashboardVolumeWindowStart(new Date());
        const volumeLoadPromise = loadDashboardVolume({
          fetchPage: (page, pageSize) =>
            queryClient.fetchQuery({
              // Val 6.1 / modul 4 (D18): include the window start in the query
              // key so results from different windows never collide; the old
              // key relied on staleTime expiring fast enough.
              queryKey: queryKeys.ticketList({
                view: "dashboard-volume",
                windowFrom: volumeStart.toISOString(),
                page,
              }),
              queryFn: () =>
                listTicketsPage({
                  createdFrom: volumeStart.toISOString(),
                  sort: "createdAt",
                  dir: "desc",
                  page,
                  pageSize,
                }),
            }),
        });
        const [
          counts,
          recentPage,
          overduePage,
          minePage,
          unassignedPage,
          criticalUnassignedPage,
          volumeLoad,
        ] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: queryKeys.dashboardSummary(dayKey),
            queryFn: () => fetchDashboardSummary(),
          }),
          queryClient.fetchQuery({
            queryKey: queryKeys.ticketList({ view: "dashboard-recent" }),
            queryFn: () =>
              listTicketsPage({
                sort: "createdAt",
                dir: "desc",
                pageSize: dashboardRecentTicketLimit,
              }),
          }),
          queryClient.fetchQuery({
            queryKey: queryKeys.ticketList({ view: "dashboard-overdue" }),
            queryFn: () =>
              listTicketsPage({
                overdue: true,
                sort: "slaDueAt",
                dir: "asc",
                pageSize: dashboardSlaWatchlistLimit,
              }),
          }),
          currentUserId === null
            ? Promise.resolve(null)
            : queryClient.fetchQuery({
                queryKey: queryKeys.ticketList({
                  view: "dashboard-assigned",
                  userId: currentUserId,
                }),
                queryFn: () =>
                  listTicketsPage({
                    assignedUserId: currentUserId,
                    status: [...dashboardOpenStatuses],
                    sort: "updatedAt",
                    dir: "desc",
                    pageSize: dashboardAttentionTicketLimit,
                  }),
              }),
          queryClient.fetchQuery({
            queryKey: queryKeys.ticketList({ view: "dashboard-unassigned" }),
            queryFn: () =>
              listTicketsPage({
                unassigned: true,
                status: [...dashboardOpenStatuses],
                sort: "updatedAt",
                dir: "desc",
                pageSize: dashboardAttentionTicketLimit,
              }),
          }),
          isStaff
            ? queryClient.fetchQuery({
                queryKey: queryKeys.ticketList({ view: "dashboard-critical-unassigned" }),
                queryFn: () =>
                  listTicketsPage({
                    unassigned: true,
                    priority: "CRITICAL",
                    status: [...dashboardOpenStatuses],
                    sort: "slaDueAt",
                    dir: "asc",
                    pageSize: dashboardAttentionTicketLimit,
                  }),
              })
            : Promise.resolve({ items: [] as readonly TicketResponse[] }),
          volumeLoadPromise,
        ]);

        setSummary(
          composeDashboardSummary({
            counts,
            recentTickets: recentPage.items,
            overdueTickets: overduePage.items,
            assignedToMeTickets: minePage?.items ?? [],
            unassignedTickets: [...unassignedPage.items, ...criticalUnassignedPage.items],
            volumeTickets: volumeLoad.tickets,
            volumeTruncated: volumeLoad.truncated,
            currentUserId,
          }),
        );

        if (!silent) {
          setIsLoading(false);
        }

        // Phase 2 (progressive): auxiliary lookups that do not block first
        // paint. Each catches independently so one failing lookup cannot blank
        // the whole dashboard.
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
        setInboxTickets(inbox);
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
    },
    [currentUserId, dayKey, isStaff, queryClient],
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
