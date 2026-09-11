import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { filterTickets, type TicketListFilters } from "@/lib/tickets/filter-tickets";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { paginateItems } from "@/lib/tickets/paginate-items";
import { useSession } from "@/lib/session/use-session";
import {
  ticketListPageSize,
  ticketWorkspaceViews,
  type TicketWorkspaceView,
} from "@/lib/tickets/ticket-constants";
import { listOfferedServices, type ServiceResponse } from "@/services/service-catalog-api";
import { claimTicket, listGroupInbox, listTickets, type TicketResponse } from "@/services/tickets-api";

function parseView(value: string | null): TicketWorkspaceView {
  if (value !== null && ticketWorkspaceViews.includes(value as TicketWorkspaceView)) {
    return value as TicketWorkspaceView;
  }
  return "inbox";
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
});

export function useTicketList() {
  const { currentUserId } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get("view"));
  const [tickets, setTickets] = useState<readonly TicketResponse[]>([]);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [inboxHidden, setInboxHidden] = useState(false);
  const [filters, setFilters] = useState<TicketListFilters>(emptyFilters(view, currentUserId));
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const queryFromUrl = searchParams.get("q") ?? "";

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const [catalog, rows] =
        view === "inbox"
          ? await Promise.all([listOfferedServices().catch(() => []), listGroupInbox()])
          : await Promise.all([
              listOfferedServices().catch(() => []),
              listTickets(filters.status === "" ? {} : { status: filters.status }),
            ]);
      setServices(catalog);
      setTickets(rows);
      setInboxHidden(false);
    } catch (error) {
      const mapped = mapTicketError(error);
      if (view === "inbox" && (mapped === "tickets.errorForbidden" || mapped === "tickets.errorInboxDisabled")) {
        setInboxHidden(true);
        setSearchParams({ view: "all" });
        return;
      }
      setTickets([]);
      setErrorKey(mapped);
    } finally {
      setIsLoading(false);
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

  const visible = useMemo(
    () => filterTickets(tickets, { ...filters, view, currentUserId }),
    [tickets, filters, view, currentUserId],
  );
  const paged = paginateItems(visible, page, ticketListPageSize);
  const unroutedCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "UNROUTED").length,
    [tickets],
  );
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
      setErrorKey(mapTicketError(error));
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
    inboxHidden,
    filters,
    setFilters: (next: TicketListFilters) => {
      setFilters(next);
      setPage(1);
    },
    page,
    setPage,
    paged,
    visible,
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
