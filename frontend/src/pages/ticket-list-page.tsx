import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketErrorState, TicketEmptyState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketListFiltersBar } from "@/components/tickets/ticket-list-filters";
import { TicketListTable } from "@/components/tickets/ticket-list-table";
import { TicketWorkspaceNav } from "@/components/tickets/ticket-workspace-nav";
import { TicketBulkBar } from "@/components/tickets/ticket-bulk-bar";
import { TicketSavedViewsPanel } from "@/components/tickets/ticket-saved-views-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useTicketList } from "@/lib/tickets/use-ticket-list";

export function TicketListPage() {
  const { t } = useTranslation();
  const list = useTicketList();
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("tickets.title")]}
        title={t("tickets.title")}
        subtitle={t("tickets.intro")}
        actions={
          <Button asChild size="sm">
            <Link to="/tickets/new">
              <Plus size={14} /> {t("tickets.createAction")}
            </Link>
          </Button>
        }
      />
      <TicketWorkspaceNav view={list.view} inboxHidden={list.inboxHidden} />
      {list.view === "inbox" && list.unroutedCount > 0 ? (
        <p className="mt-3 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {t("tickets.unroutedBanner")}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <TicketSavedViewsPanel
          filters={list.filters}
          onApply={list.setFilters}
          onError={list.setErrorKey}
        />
        <div className="min-w-0">
          <TicketListFiltersBar filters={list.filters} services={list.services} onChange={list.setFilters} />
          <TicketBulkBar
            selectedIds={list.selectedIds}
            onClear={() => list.setSelectedIds(new Set())}
            onError={list.setErrorKey}
            onComplete={() => {
              list.setSelectedIds(new Set());
              void list.load();
            }}
          />
          {list.isLoading ? (
            <TicketLoadingState />
          ) : list.errorKey ? (
            <TicketErrorState errorKey={list.errorKey} onRetry={() => void list.load()} />
          ) : list.visible.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <TicketEmptyState
                title={t("tickets.emptyTitle")}
                body={t("tickets.emptyHint")}
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/tickets/new">{t("tickets.createAction")}</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <TicketListTable
                tickets={list.paged.pageItems}
                serviceNames={list.serviceNames}
                claimingId={list.claimingId}
                selectedIds={list.selectedIds}
                onToggleSelected={list.toggleSelected}
                onClaim={(ticketId) => void list.onClaim(ticketId)}
              />
              {list.paged.totalPages > 1 ? (
                <div className="mt-3 flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={list.paged.page === 1} onClick={() => list.setPage(list.paged.page - 1)}>
                    {t("tickets.previous")}
                  </Button>
                  <span className="text-[12px] text-muted-foreground tnum">
                    {t("tickets.page", { page: list.paged.page, total: list.paged.totalPages })}
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={list.paged.page === list.paged.totalPages} onClick={() => list.setPage(list.paged.page + 1)}>
                    {t("tickets.next")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
