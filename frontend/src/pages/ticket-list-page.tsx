import { Plus, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketErrorState, TicketEmptyState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketInboxList } from "@/components/tickets/ticket-inbox-list";
import { TicketListFiltersBar } from "@/components/tickets/ticket-list-filters";
import { TicketListTable } from "@/components/tickets/ticket-list-table";
import { TicketWorkspaceNav } from "@/components/tickets/ticket-workspace-nav";
import { TicketBulkBar } from "@/components/tickets/ticket-bulk-bar";
import { TicketSavedViewsPanel } from "@/components/tickets/ticket-saved-views-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";
import { ticketStatusValues, ticketViewLabelKey, ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { clearedTicketListFilters } from "@/lib/tickets/filter-tickets";
import { useTicketList } from "@/lib/tickets/use-ticket-list";
import type { TicketStatus } from "@/services/tickets-api";

export function TicketListPage() {
  const { t } = useTranslation();
  const list = useTicketList();
  const isInbox = list.view === "inbox";
  const openCount = list.tickets.filter(
    (ticket) => ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && ticket.status !== "ARCHIVED",
  ).length;
  const pageTitle = isInbox
    ? t("tickets.views.inbox")
    : ticketText(t, ticketViewLabelKey[list.view]);
  const pageSubtitle = isInbox
    ? t("tickets.inboxHint")
    : ticketText(t, "tickets.listSubtitle", { open: openCount });
  const createActionLabel = t("tickets.createAction");
  const ticketsTitle = t("tickets.title");
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", ticketsTitle]}
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <Button asChild size="sm">
            <Link to="/tickets/new">
              <Plus size={14} /> {createActionLabel}
            </Link>
          </Button>
        }
      />
      <TicketWorkspaceNav view={list.view} inboxHidden={list.inboxHidden} />
      {isInbox && list.unroutedCount > 0 ? (
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/6 px-4 py-3 text-[12.5px] leading-5 text-foreground/90">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <p className="flex-1 text-danger">{t("tickets.unroutedBanner")}</p>
        </div>
      ) : null}
      <div className={isInbox ? "mt-4" : "mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"}>
        {isInbox ? null : (
          <TicketSavedViewsPanel
            filters={list.filters}
            onApply={list.setFilters}
            onError={list.setErrorKey}
          />
        )}
        <div className="min-w-0">
          {isInbox ? null : (
            <UnderlineTabs
              className="mb-3"
              active={list.filters.status === "" ? "ALL" : list.filters.status}
              onChange={(key) =>
                list.setFilters({
                  ...list.filters,
                  status: key === "ALL" ? "" : (key as TicketStatus),
                })
              }
              items={[
                { key: "ALL", label: t("tickets.filters.all"), count: list.tickets.length },
                ...ticketStatusValues.map((status) => ({
                  key: status,
                  label: ticketText(t, ticketStatusLabelKey[status]),
                  count: list.tickets.filter((ticket) => ticket.status === status).length,
                })),
              ]}
            />
          )}
          <TicketListFiltersBar filters={list.filters} services={list.services} onChange={list.setFilters} />
          {isInbox ? null : (
            <TicketBulkBar
              selectedIds={list.selectedIds}
              onClear={() => list.setSelectedIds(new Set())}
              onError={list.setErrorKey}
              onComplete={() => {
                list.setSelectedIds(new Set());
                void list.load();
              }}
            />
          )}
          {list.isLoading ? (
            <TicketLoadingState />
          ) : list.errorKey ? (
            <TicketErrorState errorKey={list.errorKey} onRetry={() => void list.load()} />
          ) : list.visible.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <TicketEmptyState
                title={t("tickets.emptyFilterTitle")}
                body={t("tickets.emptyFilterHint")}
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => list.setFilters(clearedTicketListFilters(list.filters))}
                  >
                    {t("tickets.clearFilters")}
                  </Button>
                }
              />
            </div>
          ) : isInbox ? (
            <TicketInboxList
              tickets={list.paged.pageItems}
              serviceNames={list.serviceNames}
              claimingId={list.claimingId}
              onClaim={(ticketId) => void list.onClaim(ticketId)}
            />
          ) : (
            <TicketListTable
              tickets={list.paged.pageItems}
              serviceNames={list.serviceNames}
              selectedIds={list.selectedIds}
              onToggleSelected={list.toggleSelected}
            />
          )}
          {list.paged.totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted-foreground/70">
              <Button type="button" variant="outline" size="sm" disabled={list.paged.page === 1} onClick={() => list.setPage(list.paged.page - 1)}>
                {t("tickets.previous")}
              </Button>
              <span className="tnum">{ticketText(t, "tickets.page", { page: list.paged.page, total: list.paged.totalPages })}</span>
              <Button type="button" variant="outline" size="sm" disabled={list.paged.page === list.paged.totalPages} onClick={() => list.setPage(list.paged.page + 1)}>
                {t("tickets.next")}
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-[11.5px] text-muted-foreground/70">
              {ticketText(t, "tickets.listShown", { shown: list.visible.length, total: list.tickets.length })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
