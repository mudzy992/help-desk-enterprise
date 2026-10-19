import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { unroutedInboxTabKey, unroutedTicketsFromList } from "@/lib/tickets/inbox-view-tabs";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { toTicketCountsQuery, toTicketPageQuery } from "@/lib/tickets/ticket-page-query";
import { ticketCountsQueryOptions } from "@/lib/tickets/ticket-counts-query";
import {
  ticketListPageSize,
  unroutedTicketPageSize,
  type TicketWorkspaceView,
} from "@/lib/tickets/ticket-constants";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import { listOfferedServices, type ServiceResponse } from "@/services/service-catalog-api";
import {
  getGroupInboxStatus,
  listGroupInboxPage,
  listTicketsPage,
  type TicketPage,
  type TicketResponse,
} from "@/services/tickets-api";
import type { TicketCounts } from "@/services/tickets-counts-api";

type ReadResult<T> = {
  readonly value: T | null;
  readonly errorKey: TicketErrorKey | null;
};

export type TicketListPageInfo = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalIsCapped: boolean;
};

export type TicketListSnapshot = {
  readonly services: readonly ServiceResponse[];
  readonly catalogErrorKey: TicketErrorKey | null;
  readonly pageItems: readonly TicketResponse[];
  readonly pageInfo: TicketListPageInfo;
  readonly inboxGroupId: string | null;
  readonly counts: TicketCounts | null;
  readonly countsErrorKey: TicketErrorKey | null;
  readonly unroutedTickets: readonly TicketResponse[];
  readonly unroutedTotal: number;
  readonly unroutedPageInfo: Pick<TicketListPageInfo, "page" | "pageSize" | "total"> | null;
  readonly unroutedErrorKey: TicketErrorKey | null;
  readonly membershipErrorKey: TicketErrorKey | null;
  readonly hasGroupMembership: boolean | null;
};

type FetchTicketListSnapshotInput = {
  readonly view: TicketWorkspaceView;
  readonly filters: TicketListFilters;
  readonly page: number;
  readonly unroutedPage: number;
  readonly currentUserId: string | null;
  readonly queryClient: QueryClient;
  readonly silent: boolean;
};

async function captureRead<T>(request: Promise<T>): Promise<ReadResult<T>> {
  try {
    return { value: await request, errorKey: null };
  } catch (error) {
    return { value: null, errorKey: mapTicketError(error) };
  }
}

async function invalidateBeforeSilentReload(
  queryClient: QueryClient,
  queryKeysToInvalidate: readonly (readonly unknown[])[],
): Promise<void> {
  await Promise.all(
    queryKeysToInvalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export async function fetchTicketListSnapshot({
  view,
  filters,
  page,
  unroutedPage,
  currentUserId,
  queryClient,
  silent,
}: FetchTicketListSnapshotInput): Promise<TicketListSnapshot> {
  const servicesPromise = captureRead(
    queryClient.fetchQuery({
      queryKey: queryKeys.offeredServices,
      queryFn: () => listOfferedServices(),
    }),
  );

  if (view === "inbox") {
    const unroutedQuery = {
      unroutedQueue: true,
      hideMerged: filters.hideMerged === true ? true : undefined,
      page: unroutedPage,
      pageSize: unroutedTicketPageSize,
    } as const;
    const selectedTab = filters.inboxTab ?? unroutedInboxTabKey;
    const inboxGroupId = selectedTab === unroutedInboxTabKey ? null : selectedTab;
    const inboxQuery =
      inboxGroupId === null ? null : { groupId: inboxGroupId, page, pageSize: ticketListPageSize };
    if (silent) {
      await invalidateBeforeSilentReload(queryClient, [
        queryKeys.groupInbox,
        ...(inboxQuery === null ? [] : [queryKeys.groupInboxPage(inboxQuery)]),
        queryKeys.ticketList(unroutedQuery),
        queryKeys.ticketCountsPrefix,
      ]);
    }
    const [services, inboxPage, unroutedResult, membershipResult] = await Promise.all([
      servicesPromise,
      inboxQuery === null
        ? Promise.resolve(null)
        : queryClient.fetchQuery({
            queryKey: queryKeys.groupInboxPage(inboxQuery),
            queryFn: () => listGroupInboxPage(inboxQuery),
          }),
      captureRead(
        queryClient.fetchQuery({
          queryKey: queryKeys.ticketList(unroutedQuery),
          queryFn: () => listTicketsPage(unroutedQuery),
        }),
      ),
      captureRead(getGroupInboxStatus()),
    ]);
    const unroutedPageResponse = unroutedResult.value;
    return {
      services: services.value ?? [],
      catalogErrorKey: services.errorKey,
      pageItems: inboxPage?.items ?? [],
      pageInfo:
        inboxPage === null
          ? {
              page: 1,
              pageSize: ticketListPageSize,
              total: 0,
              totalIsCapped: false,
            }
          : {
              page: inboxPage.page,
              pageSize: inboxPage.pageSize,
              total: inboxPage.total,
              totalIsCapped: inboxPage.totalIsCapped === true,
            },
      inboxGroupId,
      counts: null,
      countsErrorKey: null,
      unroutedTickets: unroutedTicketsFromList(unroutedPageResponse?.items ?? []),
      unroutedTotal: unroutedPageResponse?.total ?? 0,
      unroutedPageInfo:
        unroutedPageResponse === null
          ? null
          : {
              page: unroutedPageResponse.page,
              pageSize: unroutedPageResponse.pageSize,
              total: unroutedPageResponse.total,
            },
      unroutedErrorKey: unroutedResult.errorKey,
      membershipErrorKey: membershipResult.errorKey,
      hasGroupMembership: membershipResult.value?.hasGroupMembership ?? null,
    };
  }

  const query = toTicketPageQuery({ filters, view, currentUserId, page });
  const countsQuery = toTicketCountsQuery(query);
  if (silent) {
    await invalidateBeforeSilentReload(queryClient, [
      queryKeys.ticketList(query),
      queryKeys.ticketCountsPrefix,
    ]);
  }
  const [services, response, counts] = await Promise.all([
    servicesPromise,
    queryClient.fetchQuery({
      queryKey: queryKeys.ticketList(query),
      queryFn: () => listTicketsPage(query),
    }),
    captureRead(queryClient.fetchQuery(ticketCountsQueryOptions(countsQuery))),
  ]);
  return {
    services: services.value ?? [],
    catalogErrorKey: services.errorKey,
    pageItems: response.items,
    pageInfo: {
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
      totalIsCapped: response.totalIsCapped === true,
    },
    inboxGroupId: null,
    counts: counts.value,
    countsErrorKey: counts.errorKey,
    unroutedTickets: [],
    unroutedTotal: 0,
    unroutedPageInfo: null,
    unroutedErrorKey: null,
    membershipErrorKey: null,
    hasGroupMembership: null,
  };
}

export function lastPageForEmptyPage(
  response: Pick<TicketPage, "items" | "total" | "page" | "pageSize">,
): number | null {
  if (response.items.length !== 0 || response.total === 0 || response.page <= 1) return null;
  return Math.max(1, Math.ceil(response.total / response.pageSize));
}
