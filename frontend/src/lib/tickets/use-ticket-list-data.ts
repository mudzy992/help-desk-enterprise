import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { useSearchParams } from "react-router-dom";
import { useTicketCollectionRealtime } from "@/lib/realtime/use-ticket-collection-realtime";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { createLatestRequestGate } from "@/lib/tickets/latest-request-gate";
import {
  fetchTicketListSnapshot,
  lastPageForEmptyPage,
} from "@/lib/tickets/fetch-ticket-list-snapshot";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import { ticketListPageSize, type TicketWorkspaceView } from "@/lib/tickets/ticket-constants";
import type { TicketResponse } from "@/services/tickets-api";
import type { TicketCounts } from "@/services/tickets-counts-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

type SetSearchParams = ReturnType<typeof useSearchParams>[1];

type UseTicketListDataInput = {
  readonly enabled: boolean;
  readonly view: TicketWorkspaceView;
  readonly filters: TicketListFilters;
  readonly page: number;
  readonly setPage: (page: number) => void;
  readonly unroutedPage: number;
  readonly setUnroutedPage: (page: number) => void;
  readonly currentUserId: string | null;
  readonly setSearchParams: SetSearchParams;
};

export function useTicketListData({
  enabled,
  view,
  filters,
  page,
  setPage,
  unroutedPage,
  setUnroutedPage,
  currentUserId,
  setSearchParams,
}: UseTicketListDataInput) {
  const queryClient = useQueryClient();
  const [pageItems, setPageItems] = useState<readonly TicketResponse[]>([]);
  const [pageInfo, setPageInfo] = useState({
    page: 1,
    pageSize: ticketListPageSize,
    total: 0,
    totalIsCapped: false,
  });
  const [inboxGroupCounts, setInboxGroupCounts] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [counts, setCounts] = useState<TicketCounts | null>(null);
  const [unroutedTickets, setUnroutedTickets] = useState<readonly TicketResponse[]>([]);
  const [unroutedTotal, setUnroutedTotal] = useState(0);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [catalogErrorKey, setCatalogErrorKey] = useState<TicketErrorKey | null>(null);
  const [unroutedErrorKey, setUnroutedErrorKey] = useState<TicketErrorKey | null>(null);
  const [membershipErrorKey, setMembershipErrorKey] = useState<TicketErrorKey | null>(null);
  const [inboxHidden, setInboxHidden] = useState(false);
  const [hasGroupMembership, setHasGroupMembership] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const requestGate = useMemo(createLatestRequestGate, []);
  const pendingVisibleLoads = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!enabled) return;
      const requestToken = requestGate.begin();
      if (!silent) {
        pendingVisibleLoads.current += 1;
        setIsLoading(true);
        setErrorKey(null);
      }
      try {
        const snapshot = await fetchTicketListSnapshot({
          view,
          filters,
          page,
          unroutedPage,
          currentUserId,
          queryClient,
          silent,
        });
        if (!requestGate.isLatest(requestToken)) return;
        setServices(snapshot.services);
        setCatalogErrorKey(snapshot.catalogErrorKey);
        setUnroutedErrorKey(snapshot.unroutedErrorKey);
        setMembershipErrorKey(snapshot.membershipErrorKey);
        setPageItems(snapshot.pageItems);
        setPageInfo(snapshot.pageInfo);
        if (silent && view === "inbox") setInboxGroupCounts(new Map());
        const inboxGroupId = snapshot.inboxGroupId;
        if (inboxGroupId !== null) {
          setInboxGroupCounts((current) =>
            new Map(current).set(inboxGroupId, snapshot.pageInfo.total),
          );
        }
        setCounts(snapshot.counts);
        setUnroutedTickets(snapshot.unroutedTickets);
        setUnroutedTotal(snapshot.unroutedTotal);
        setHasGroupMembership(snapshot.hasGroupMembership);
        setInboxHidden(false);

        const lastTicketPage = lastPageForEmptyPage({
          items: snapshot.pageItems,
          page: snapshot.pageInfo.page,
          pageSize: snapshot.pageInfo.pageSize,
          total: snapshot.pageInfo.total,
        });
        if (lastTicketPage !== null) setPage(lastTicketPage);
        const unroutedInfo = snapshot.unroutedPageInfo;
        const lastUnroutedPage =
          unroutedInfo === null || snapshot.unroutedTickets.length > 0
            ? null
            : lastPageForEmptyPage({ items: [], ...unroutedInfo });
        if (lastUnroutedPage !== null) setUnroutedPage(lastUnroutedPage);
      } catch (error) {
        if (!requestGate.isLatest(requestToken)) return;
        const mapped = mapTicketError(error);
        if (
          view === "inbox" &&
          (mapped === "tickets.errorForbidden" || mapped === "tickets.errorInboxDisabled")
        ) {
          setInboxHidden(true);
          setSearchParams({ view: "all" });
          return;
        }
        if (silent) return;
        setPageItems([]);
        setUnroutedTickets([]);
        setUnroutedTotal(0);
        setErrorKey(mapped);
      } finally {
        if (!silent) {
          pendingVisibleLoads.current -= 1;
          if (pendingVisibleLoads.current === 0) setIsLoading(false);
        }
      }
    },
    [
      currentUserId,
      enabled,
      filters,
      page,
      queryClient,
      requestGate,
      setPage,
      setSearchParams,
      setUnroutedPage,
      unroutedPage,
      view,
    ],
  );

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);
  const reloadSilent = useCallback(() => load(true), [load]);
  useTicketCollectionRealtime(reloadSilent);

  return {
    pageItems,
    pageInfo,
    inboxGroupCounts,
    counts,
    unroutedTickets,
    unroutedTotal,
    services,
    catalogErrorKey,
    unroutedErrorKey,
    membershipErrorKey,
    inboxHidden,
    hasGroupMembership,
    isLoading,
    errorKey,
    setErrorKey,
    load,
  };
}
