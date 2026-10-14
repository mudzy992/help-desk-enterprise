import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { defaultInboxTab, type TicketListFilters } from "@/lib/tickets/filter-tickets";
import { readCreatedRangeParam } from "@/lib/tickets/created-range";
import { staffDeepLinkFilters } from "@/lib/tickets/staff-deep-link-filters";
import { useTicketListSelection } from "@/lib/tickets/use-ticket-list-selection";
import { workspaceViewsFor, type TicketWorkspaceView } from "@/lib/tickets/ticket-constants";

type TicketListViewStateInput = {
  readonly currentUserId: string | null;
  readonly isStaff: boolean;
  readonly hasSession: boolean;
};

function parseView(value: string | null, isStaff: boolean): TicketWorkspaceView {
  const allowed = workspaceViewsFor(isStaff);
  if (value !== null && allowed.includes(value as TicketWorkspaceView)) {
    return value as TicketWorkspaceView;
  }
  return isStaff ? "inbox" : "all";
}

function emptyFilters(
  view: TicketWorkspaceView,
  currentUserId: string | null,
  isStaff: boolean,
  initialInboxTab?: string,
): TicketListFilters {
  return {
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
    hideMerged: isStaff,
    inboxTab: view === "inbox" ? (initialInboxTab ?? defaultInboxTab) : undefined,
  };
}

export function useTicketListState({
  currentUserId,
  isStaff,
  hasSession,
}: TicketListViewStateInput) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialDeepLinkParams] = useState(() => new URLSearchParams(searchParams));
  const view = parseView(searchParams.get("view"), isStaff);
  const initialInboxTab =
    isStaff && view === "inbox"
      ? searchParams.get("inboxTab")?.trim() || defaultInboxTab
      : undefined;
  const [filters, setFiltersState] = useState<TicketListFilters>(() => ({
    ...emptyFilters(view, currentUserId, isStaff, initialInboxTab),
    ...staffDeepLinkFilters(searchParams, isStaff),
    createdFrom: readCreatedRangeParam(searchParams.get("createdFrom")),
    createdTo: readCreatedRangeParam(searchParams.get("createdTo")),
  }));
  const [page, setPage] = useState(1);
  const [unroutedPage, setUnroutedPage] = useState(1);
  const [initialStaffDeepLinkApplied, setInitialStaffDeepLinkApplied] = useState(false);
  const isDeepLinkReady = !isStaff || initialStaffDeepLinkApplied;
  const { selectedIds, setSelectedIds, clearSelection, toggleSelected } = useTicketListSelection();
  const queryFromUrl = searchParams.get("q") ?? "";

  // Capabilities may load after the initial render. Apply the original URL's
  // staff-only filters when staff status becomes known, without a second
  // mutable "already applied" flag that can race with page state.
  useEffect(() => {
    if (!isStaff) return;
    setFiltersState((current) => ({
      ...current,
      ...staffDeepLinkFilters(initialDeepLinkParams, true),
    }));
    setPage(1);
    setInitialStaffDeepLinkApplied(true);
  }, [initialDeepLinkParams, isStaff]);

  useEffect(() => {
    setFiltersState((current) => ({
      ...current,
      view,
      currentUserId,
      search: queryFromUrl,
      inboxTab: view === "inbox" ? (current.inboxTab ?? defaultInboxTab) : undefined,
    }));
    setPage(1);
    setUnroutedPage(1);
    clearSelection();
  }, [clearSelection, currentUserId, queryFromUrl, view]);

  useEffect(() => {
    if (view === "inbox") return;
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of [
      ["createdFrom", filters.createdFrom],
      ["createdTo", filters.createdTo],
    ] as const) {
      if (value === "") next.delete(key);
      else next.set(key, value);
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters.createdFrom, filters.createdTo, searchParams, setSearchParams, view]);

  useEffect(() => {
    if (!hasSession || isStaff || searchParams.get("view") === view) return;
    const next = new URLSearchParams(searchParams);
    next.set("view", view);
    setSearchParams(next, { replace: true });
  }, [hasSession, isStaff, searchParams, setSearchParams, view]);

  const setFilters = useCallback(
    (next: TicketListFilters) => {
      setFiltersState(next);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  const setInboxTab = useCallback(
    (tab: string) => {
      if (view !== "inbox") return;
      setFiltersState((current) => ({ ...current, inboxTab: tab }));
      setPage(1);
      setUnroutedPage(1);
      clearSelection();
      const next = new URLSearchParams(searchParams);
      next.set("inboxTab", tab);
      setSearchParams(next, { replace: true });
    },
    [clearSelection, searchParams, setSearchParams, view],
  );

  const setSearch = useCallback(
    (search: string) => {
      setFiltersState((current) => ({ ...current, search }));
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  return {
    searchParams,
    setSearchParams,
    view,
    isDeepLinkReady,
    filters,
    setFilters,
    setInboxTab,
    setSearch,
    page,
    setPage,
    unroutedPage,
    setUnroutedPage,
    selectedIds,
    setSelectedIds,
    toggleSelected,
  };
}
