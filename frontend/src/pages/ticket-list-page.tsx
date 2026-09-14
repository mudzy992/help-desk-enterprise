import { useMemo } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketErrorState, TicketEmptyState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketInboxList } from "@/components/tickets/ticket-inbox-list";
import {
  TicketListFiltersBar,
  applyTicketListTab,
  ticketListTabKey,
  ticketStatusTabItems,
} from "@/components/tickets/ticket-list-filters";
import { TicketListTable, directoryAssigneeNames } from "@/components/tickets/ticket-list-table";
import { TicketWorkspaceNav } from "@/components/tickets/ticket-workspace-nav";
import { TicketBulkBar } from "@/components/tickets/ticket-bulk-bar";
import { TicketSavedViewsPanel } from "@/components/tickets/ticket-saved-views-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useDirectory } from "@/lib/directory/use-directory";
import { ticketViewLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { clearedTicketListFilters, isTicketOverdue } from "@/lib/tickets/filter-tickets";
import { useTicketList } from "@/lib/tickets/use-ticket-list";

export function TicketListPage() {
  const { t } = useTranslation();
  const list = useTicketList();
  const directory = useDirectory();
  const isInbox = list.view === "inbox";
  const assigneeNames = useMemo(
    () => directoryAssigneeNames(directory.users),
    [directory.users],
  );
  const openCount = list.tickets.filter(
    (ticket) => ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && ticket.status !== "ARCHIVED",
  ).length;
  const riskCount = list.tickets.filter(isTicketOverdue).length;
  const pageTitle = isInbox
    ? t("tickets.views.inbox")
    : ticketText(t, ticketViewLabelKey[list.view]);
  const pageSubtitle = isInbox
    ? t("tickets.inboxHint")
    : ticketText(t, "tickets.listSubtitle", { open: openCount, risk: riskCount });
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("tickets.title")]}
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <Button asChild size="sm" variant="primary">
            <Link to="/tickets/new">
              <Plus size={14} /> {t("tickets.createAction")}
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
              active={ticketListTabKey(list.filters)}
              onChange={(key) => list.setFilters(applyTicketListTab(list.filters, key))}
              items={ticketStatusTabItems(t, list.tickets, riskCount)}
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
              assigneeNames={assigneeNames}
              selectedIds={list.selectedIds}
              onToggleSelected={list.toggleSelected}
              onTogglePage={(selected) =>
                list.setSelectedIds(
                  selected ? new Set(list.paged.pageItems.map((ticket) => ticket.id)) : new Set(),
                )
              }
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
