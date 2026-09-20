import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { filterTickets, type TicketListFilters } from "@/lib/tickets/filter-tickets";
import { mapClaimError, mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { paginateItems } from "@/lib/tickets/paginate-items";
import { useTicketCollectionRealtime } from "@/lib/realtime/use-ticket-collection-realtime";
import { isTicketStaff } from "@/lib/session/route-access";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import {
  ticketListPageSize,
  workspaceViewsFor,
  type TicketWorkspaceView,
} from "@/lib/tickets/ticket-constants";
import { unroutedTicketsFromList } from "@/lib/tickets/inbox-view-tabs";
import { listOfferedServices, type ServiceResponse } from "@/services/service-catalog-api";
import {
  claimTicket,
  getGroupInboxStatus,
  listGroupInbox,
  listTickets,
  type TicketResponse,
} from "@/services/tickets-api";

function parseView(value: string | null, isStaff: boolean): TicketWorkspaceView {
  const allowed = workspaceViewsFor(isStaff);
  if (value !== null && allowed.includes(value as TicketWorkspaceView)) {
    return value as TicketWorkspaceView;
  }
  return isStaff ? "inbox" : "all";
}

const emptyFilters = (view: TicketWorkspaceView, currentUserId: string | null): TicketListFilters => ({
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
});

export function useTicketList() {
  const { currentUserId } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const capabilities = useSessionCapabilities();
  const isStaff = isTicketStaff(capabilities);
  const view = parseView(searchParams.get("view"), isStaff);
  const [tickets, setTickets] = useState<readonly TicketResponse[]>([]);
  const [unroutedTickets, setUnroutedTickets] = useState<readonly TicketResponse[]>(
    [],
  );
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [inboxHidden, setInboxHidden] = useState(false);
  const [hasGroupMembership, setHasGroupMembership] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<TicketListFilters>(emptyFilters(view, currentUserId));
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
        const [catalog, inboxRows, unroutedRows] = await Promise.all([
          listOfferedServices().catch(() => []),
          listGroupInbox(),
          listTickets({ status: "UNROUTED" }).catch(() => []),
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
        setTickets(inboxRows);
        setUnroutedTickets(unroutedTicketsFromList(unroutedRows));
        setHasGroupMembership(membership);
      } else {
        const [catalog, rows] = await Promise.all([
          listOfferedServices().catch(() => []),
          listTickets(filters.status === "" ? {} : { status: filters.status }),
        ]);
        setServices(catalog);
        setTickets(rows);
        setUnroutedTickets([]);
        setHasGroupMembership(null);
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
      setTickets([]);
      setUnroutedTickets([]);
      setErrorKey(mapped);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [view, filters.status, setSearchParams]);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      view,
      currentUserId,
      search: queryFromUrl,
    }));
    setPage(1);
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

  const visible = useMemo(
    () => filterTickets(tickets, { ...filters, view, currentUserId }),
    [tickets, filters, view, currentUserId],
  );
  const paged = paginateItems(visible, page, ticketListPageSize);
  const unroutedCount = unroutedTickets.length;
  const serviceNames = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  );

  const onClaim = async (ticketId: string) => {
    setClaimingId(ticketId);
    setErrorKey(null);
    try {
      await claimTicket(ticketId);
      await load();
    } catch (error) {
      setErrorKey(mapClaimError(error));
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

  return {
    view,
    isStaff,
    inboxHidden,
    hasGroupMembership,
    filters,
    setFilters: (next: TicketListFilters) => {
      setFilters(next);
      setPage(1);
    },
    page,
    setPage,
    paged,
    visible,
    tickets,
    unroutedTickets,
    unroutedCount,
    serviceNames,
    services,
    isLoading,
    errorKey,
    setErrorKey,
    claimingId,
    selectedIds,
    setSelectedIds,
    toggleSelected,
    load,
    onClaim,
  };
}
