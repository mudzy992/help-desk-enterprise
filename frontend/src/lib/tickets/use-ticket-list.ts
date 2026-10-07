import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { defaultInboxTab, type TicketListFilters } from "@/lib/tickets/filter-tickets";
import { staffDeepLinkFilters } from "@/lib/tickets/staff-deep-link-filters";
import { useActionFeedback } from "@/lib/feedback/use-action-feedback";
import { mapClaimError, mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { useTicketCollectionRealtime } from "@/lib/realtime/use-ticket-collection-realtime";
import { isTicketStaff } from "@/lib/session/route-access";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import {
  ticketListPageSize,
  workspaceViewsFor,
  type TicketWorkspaceView,
} from "@/lib/tickets/ticket-constants";
import {
  toTicketCountsQuery,
  toTicketPageQuery,
} from "@/lib/tickets/ticket-page-query";
import { unroutedTicketsFromList } from "@/lib/tickets/inbox-view-tabs";
import { listOfferedServices, type ServiceResponse } from "@/services/service-catalog-api";
import { getTicketCounts, type TicketCounts } from "@/services/tickets-counts-api";
import {
  claimTicket,
  getGroupInboxStatus,
  listGroupInbox,
  listTicketsPage,
  type TicketResponse,
} from "@/services/tickets-api";

/** A list answer never carries more than 50 rows; the unrouted tab asks for it. */
const unroutedPageSize = 50;

function parseView(value: string | null, isStaff: boolean): TicketWorkspaceView {
  const allowed = workspaceViewsFor(isStaff);
  if (value !== null && allowed.includes(value as TicketWorkspaceView)) {
    return value as TicketWorkspaceView;
  }
  return isStaff ? "inbox" : "all";
}

const emptyFilters = (view: TicketWorkspaceView, currentUserId: string | null, isStaff: boolean, initialInboxTab?: string): TicketListFilters => ({
  view,
  search: "",
  status: "",
  priority: "",
  serviceId: "",
  assignedUserId: "",
  createdFrom: "",
  createdTo: "",
  currentUserId,
  overdue: false,
  forwarded: "",
  // M8 B4: staff lists hide merged children by default; toggled via checkbox.
  hideMerged: isStaff,
  // M8 B6: inbox sub-tab is part of filter state (URL-persisted).
  inboxTab: view === "inbox" ? initialInboxTab ?? defaultInboxTab : undefined,
});

/**
 * Ticket list state.
 *
 * Phase 1.1 (plan §1.1): the list used to download every ticket the caller may
 * see and then filter and page it in the browser. The filters now travel to the
 * server (`toTicketPageQuery`) and only one page comes back; the counters next
 * to the tabs come from `GET /tickets/counts`, so they still cover everything
 * the caller may list instead of just the visible page.
 */
export function useTicketList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const feedback = useActionFeedback();
  const { currentUserId } = useSession();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const capabilities = useSessionCapabilities();
  const isStaff = isTicketStaff(capabilities);
  const view = parseView(searchParams.get("view"), isStaff);
  const [pageItems, setPageItems] = useState<readonly TicketResponse[]>([]);
  const [pageInfo, setPageInfo] = useState({
    page: 1,
    pageSize: ticketListPageSize,
    total: 0,
    totalIsCapped: false,
  });
  const [counts, setCounts] = useState<TicketCounts | null>(null);
  const [unroutedTickets, setUnroutedTickets] = useState<readonly TicketResponse[]>([]);
  const [unroutedTotal, setUnroutedTotal] = useState(0);
  const [unroutedPage, setUnroutedPage] = useState(1);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [inboxHidden, setInboxHidden] = useState(false);
  const [hasGroupMembership, setHasGroupMembership] = useState<boolean | null>(null);
  const initialInboxTab = isStaff && view === "inbox"
    ? (searchParams.get("inboxTab")?.trim() || defaultInboxTab)
    : undefined;
  const [filters, setFilters] = useState<TicketListFilters>(() => ({
    ...emptyFilters(view, currentUserId, isStaff, initialInboxTab),
    ...staffDeepLinkFilters(searchParams, isStaff),
  }));
  // Capabilities load asynchronously, so on a fresh page load `isStaff` is
  // still false during the first render and the staff deep-link filters above
  // resolve to their empty values. Apply them once when staff status is
  // confirmed; later URL-independent edits by the user are left alone.
  const staffDeepLinkApplied = useRef(isStaff);
  useEffect(() => {
    if (!isStaff || staffDeepLinkApplied.current) {
      return;
    }
    staffDeepLinkApplied.current = true;
    setFilters((current) => ({
      ...current,
      ...staffDeepLinkFilters(searchParams, true),
    }));
    setPage(1);
  }, [isStaff, searchParams]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const queryFromUrl = searchParams.get("q") ?? "";

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setErrorKey(null);
    }
    try {
      if (view === "inbox") {
        // Faza 3.3: reads go through the query cache, so coming back to a screen
        // inside `staleTime` costs no request — the socket invalidates the keys
        // when something really changed.
        const [catalog, inboxRows, unroutedPageResponse] = await Promise.all([
          queryClient
            .fetchQuery({
              queryKey: queryKeys.offeredServices,
              queryFn: () => listOfferedServices(),
            })
            .catch(() => []),
          queryClient.fetchQuery({
            queryKey: queryKeys.groupInbox,
            queryFn: () => listGroupInbox(),
          }),
          queryClient
            .fetchQuery({
              queryKey: queryKeys.ticketList({
                unroutedQueue: true,
                hideMerged: filters.hideMerged === true ? true : undefined,
                page: unroutedPage,
                pageSize: unroutedPageSize,
              }),
              queryFn: () =>
                listTicketsPage({
                  unroutedQueue: true,
                  hideMerged: filters.hideMerged === true ? true : undefined,
                  page: unroutedPage,
                  pageSize: unroutedPageSize,
                }),
            })
            .catch(() => null),
        ]);
        // An empty inbox is ambiguous: ask the server whether it is empty
        // because the person is in no handler group or simply has no tickets.
        const membership =
          inboxRows.length > 0
            ? true
            : await getGroupInboxStatus().then(
                (status) => status.hasGroupMembership,
                () => null,
              );
        setServices(catalog);
        setPageItems(inboxRows);
        setPageInfo({
          page: 1,
          pageSize: inboxRows.length === 0 ? ticketListPageSize : inboxRows.length,
          total: inboxRows.length,
          totalIsCapped: false,
        });
        setUnroutedTickets(unroutedTicketsFromList(unroutedPageResponse?.items ?? []));
        setUnroutedTotal(unroutedPageResponse?.total ?? 0);
        if (
          unroutedPageResponse !== null &&
          unroutedPageResponse.items.length === 0 &&
          unroutedPageResponse.total > 0 &&
          unroutedPageResponse.page > 1
        ) {
          setUnroutedPage(
            Math.max(
              1,
              Math.ceil(unroutedPageResponse.total / unroutedPageResponse.pageSize),
            ),
          );
        }
        setCounts(null);
        setHasGroupMembership(membership);
      } else {
        const query = toTicketPageQuery({
          filters,
          view,
          currentUserId,
          page,
        });
        const [catalog, response] = await Promise.all([
          queryClient
            .fetchQuery({
              queryKey: queryKeys.offeredServices,
              queryFn: () => listOfferedServices(),
            })
            .catch(() => []),
          queryClient.fetchQuery({
            queryKey: queryKeys.ticketList(query),
            queryFn: () => listTicketsPage(query),
          }),
        ]);
        setServices(catalog);
        setPageItems(response.items);
        setPageInfo({
          page: response.page,
          pageSize: response.pageSize,
          total: response.total,
          totalIsCapped: response.totalIsCapped === true,
        });
        setUnroutedTickets([]);
        setUnroutedTotal(0);
        setHasGroupMembership(null);
        // Counters are a separate, cheaper read: they cover all matching
        // tickets, not just the page, and they are allowed to fail (the tabs
        // then show zeros instead of breaking the list).
        const countsQuery = toTicketCountsQuery(query);
        setCounts(
          await queryClient
            .fetchQuery({
              queryKey: queryKeys.ticketCounts(countsQuery),
              queryFn: () => getTicketCounts(countsQuery),
            })
            .catch(() => null),
        );
        // A filter can move the requested page past the end; fall back to the
        // last page that does have rows.
        if (
          response.items.length === 0 &&
          response.total > 0 &&
          response.page > 1
        ) {
          setPage(Math.max(1, Math.ceil(response.total / response.pageSize)));
        }
      }
      setInboxHidden(false);
    } catch (error) {
      const mapped = mapTicketError(error);
      if (view === "inbox" && (mapped === "tickets.errorForbidden" || mapped === "tickets.errorInboxDisabled")) {
        setInboxHidden(true);
        setSearchParams({ view: "all" });
        return;
      }
      if (silent) {
        return;
      }
      setPageItems([]);
      setUnroutedTickets([]);
      setUnroutedTotal(0);
      setErrorKey(mapped);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [view, filters, page, unroutedPage, currentUserId, queryClient, setSearchParams]);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      view,
      currentUserId,
      search: queryFromUrl,
      // When leaving the inbox the tab is meaningless; when (re-)entering it
      // fall back to the remembered tab or the unrouted default so navigation
      // doesn't accidentally strand the user on a hidden group tab.
      inboxTab: view === "inbox" ? current.inboxTab ?? defaultInboxTab : undefined,
    }));
    setPage(1);
    setUnroutedPage(1);
    setSelectedIds(new Set());
  }, [view, currentUserId, queryFromUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  // A requester who lands on the bare list or on a staff-only view is moved to
  // an explicit allowed view, so the sidebar highlights the right entry.
  useEffect(() => {
    if (capabilities.session === null || isStaff) {
      return;
    }
    if (searchParams.get("view") !== view) {
      const next = new URLSearchParams(searchParams);
      next.set("view", view);
      setSearchParams(next, { replace: true });
    }
  }, [capabilities.session, isStaff, searchParams, setSearchParams, view]);

  const reloadSilent = useCallback(async () => {
    await load(true);
  }, [load]);
  useTicketCollectionRealtime(reloadSilent);

  const totalPages = Math.max(
    1,
    Math.ceil(pageInfo.total / pageInfo.pageSize),
  );
  const unroutedCount = unroutedTotal;
  const unroutedTotalPages = Math.max(1, Math.ceil(unroutedTotal / unroutedPageSize));
  const serviceNames = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  );

  const onClaim = async (ticketId: string) => {
    setClaimingId(ticketId);
    try {
      await claimTicket(ticketId);
      // The claim changed a ticket, so the cached pages and counters are stale.
      await queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      // Claim errors/success now go through the feedback seam instead of
      // `errorKey`, so a failed claim never blanks the inbox (Constitution
      // §30) and a successful one no longer forces a skeleton flash — the
      // banner already confirms it, so the revalidation can be silent.
      feedback.notify("success", "tickets.claimSuccess", {
        action: {
          label: t("tickets.claimSuccessOpen"),
          onClick: () => navigate(`/tickets/${ticketId}`),
        },
      });
      await load(true);
    } catch (error) {
      feedback.notify("error", mapClaimError(error));
    } finally {
      setClaimingId(null);
    }
  };

  const toggleSelected = (ticketId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  };

  /**
   * M8 B6: changing the inbox sub-tab updates the URL (so reload keeps it)
   * and resets the unrouted pager back to page 1. Group tabs stay in local
   * React state only insofar as the filter state reflects them — everything
   * else reads from filters.inboxTab.
   */
  const setInboxTab = useCallback(
    (tab: string) => {
      if (view !== "inbox") return;
      setFilters((current) => ({ ...current, inboxTab: tab }));
      setUnroutedPage(1);
      setSelectedIds(new Set());
      const next = new URLSearchParams(searchParams);
      next.set("inboxTab", tab);
      setSearchParams(next, { replace: true });
    },
    [view, searchParams, setSearchParams],
  );

  return {
    view,
    isStaff,
    inboxHidden,
    hasGroupMembership,
    filters,
    setFilters: (next: TicketListFilters) => {
      setFilters(next);
      setPage(1);
      setSelectedIds(new Set());
    },
    setInboxTab,
    page,
    setPage,
    totalPages,
    pageItems,
    total: pageInfo.total,
    totalIsCapped: pageInfo.totalIsCapped,
    counts,
    unroutedTickets,
    unroutedCount,
    unroutedPage,
    unroutedTotalPages,
    setUnroutedPage,
    serviceNames,
    services,
    isLoading,
    errorKey,
    setErrorKey,
    feedback: feedback.feedback,
    dismissFeedback: feedback.dismiss,
    claimingId,
    selectedIds,
    setSelectedIds,
    toggleSelected,
    load,
    onClaim,
  };
}

