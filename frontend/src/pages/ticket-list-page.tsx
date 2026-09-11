import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketErrorState, TicketEmptyState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketListFiltersBar } from "@/components/tickets/ticket-list-filters";
import { TicketListTable } from "@/components/tickets/ticket-list-table";
import { TicketWorkspaceNav } from "@/components/tickets/ticket-workspace-nav";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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

export function TicketListPage() {
  const { t } = useTranslation();
  const { currentUserId } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get("view"));
  const [tickets, setTickets] = useState<readonly TicketResponse[]>([]);
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [inboxHidden, setInboxHidden] = useState(false);
  const [filters, setFilters] = useState<TicketListFilters>({
    view,
    search: "",
    status: "",
    priority: "",
    serviceId: "",
    currentUserId,
  });
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

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
    setFilters((current) => ({ ...current, view, currentUserId }));
    setPage(1);
  }, [view, currentUserId]);

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

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("tickets.title")]}
        title={t("tickets.title")}
        subtitle={t("tickets.intro")}
        actions={
          <Button asChild size="sm">
            <Link to="/tickets/new">{t("tickets.createAction")}</Link>
          </Button>
        }
      />
      <TicketWorkspaceNav view={view} inboxHidden={inboxHidden} />
      {view === "inbox" && unroutedCount > 0 ? (
        <p className="mt-3 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {t("tickets.unroutedBanner")}
        </p>
      ) : null}
      <TicketListFiltersBar
        filters={{ ...filters, view, currentUserId }}
        services={services}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
      />
      {isLoading ? (
        <TicketLoadingState />
      ) : errorKey ? (
        <TicketErrorState errorKey={errorKey} onRetry={() => void load()} />
      ) : visible.length === 0 ? (
        <TicketEmptyState
          title={t("tickets.emptyTitle")}
          body={t("tickets.emptyHint")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/tickets/new">{t("tickets.createAction")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <TicketListTable
            tickets={paged.pageItems}
            serviceNames={serviceNames}
            claimingId={claimingId}
            onClaim={(ticketId) => void onClaim(ticketId)}
          />
          {paged.totalPages > 1 ? (
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paged.page === 1}
                onClick={() => setPage(paged.page - 1)}
              >
                {t("tickets.previous")}
              </Button>
              <span className="text-[12px] text-muted-foreground tnum">
                {t("tickets.page", { page: paged.page, total: paged.totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paged.page === paged.totalPages}
                onClick={() => setPage(paged.page + 1)}
              >
                {t("tickets.next")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
