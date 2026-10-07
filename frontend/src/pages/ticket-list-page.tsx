import { useMemo } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketErrorState, TicketEmptyState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketInboxPanel } from "@/components/tickets/ticket-inbox-panel";
import {
  TicketListFiltersBar,
  applyTicketListTab,
  ticketListTabKey,
  ticketStatusTabItems,
} from "@/components/tickets/ticket-list-filters";
import { TicketListTable, directoryAssigneeNames } from "@/components/tickets/ticket-list-table";
import { TicketWorkspaceNav } from "@/components/tickets/ticket-workspace-nav";
import { TicketBulkBar } from "@/components/tickets/ticket-bulk-bar";
import { TicketSavedViewsMenu } from "@/components/tickets/ticket-saved-views-menu";
import { Button } from "@/components/ui/button";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useDirectory } from "@/lib/directory/use-directory";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { ticketViewLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { clearedTicketListFilters, defaultInboxTab } from "@/lib/tickets/filter-tickets";
import { useTicketList } from "@/lib/tickets/use-ticket-list";
import { useTicketsCsvExport } from "@/lib/tickets/use-tickets-csv-export";

export function TicketListPage() {
  const { t } = useTranslation();
  const list = useTicketList();
  const directory = useDirectory();
  const { hasPermission } = useSessionCapabilities();
  const canExport = hasPermission(permissionKeys.auditExport);
  const canManageGroups = hasPermission(permissionKeys.groupManage);
  const csvExport = useTicketsCsvExport(list.filters, list.setErrorKey);
  const isInbox = list.view === "inbox";
  const inboxActiveTab = list.filters.inboxTab ?? defaultInboxTab;
  const assigneeNames = useMemo(
    () => directoryAssigneeNames(directory.users),
    [directory.users],
  );
  const originNames = useMemo(
    () => flattenOrganizationalUnitNames(directory.tree),
    [directory.tree],
  );
  // Phase 1.1: the headline numbers come from the server counters (they cover
  // every matching ticket), not from the rows of the current page.
  const openCount = list.counts?.open ?? 0;
  const riskCount = list.counts?.overdue ?? 0;
  const pageTitle = isInbox
    ? t("tickets.views.inbox")
    : ticketText(t, ticketViewLabelKey[list.view]);
  const pageSubtitle = isInbox
    ? t("tickets.inboxHint")
    : ticketText(t, "tickets.listSubtitle", { open: openCount, risk: riskCount });
  const crumbs = isInbox
    ? [brandCrumb, t("tickets.title"), t("tickets.views.inbox")]
    : [brandCrumb, t("tickets.title")];
  return (
    <section>
      <PageHeader
        crumbs={crumbs}
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <>
            {isInbox ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void list.load()}>
                <RefreshCw size={14} /> {t("tickets.inboxRefresh")}
              </Button>
            ) : null}
            {!isInbox && canExport ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={csvExport.isExporting}
                onClick={() => void csvExport.run()}
              >
                <Download size={14} />{" "}
                {csvExport.isExporting ? t("tickets.exportRunning") : t("tickets.exportCsv")}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="primary">
              <Link to="/tickets/new">
                <Plus size={14} /> {t("tickets.createAction")}
              </Link>
            </Button>
          </>
        }
      />
      {isInbox ? (
        <TicketInboxPanel
          activeTab={inboxActiveTab}
          onChangeTab={list.setInboxTab}
          inboxTickets={list.pageItems}
          unroutedTickets={list.unroutedTickets}
          unroutedCount={list.unroutedCount}
          unroutedPage={list.unroutedPage}
          unroutedTotalPages={list.unroutedTotalPages}
          onChangeUnroutedPage={list.setUnroutedPage}
          serviceNames={list.serviceNames}
          originNames={originNames}
          requesterNames={assigneeNames}
          claimingId={list.claimingId}
          hasGroupMembership={list.hasGroupMembership}
          canManageGroups={canManageGroups}
          isLoading={list.isLoading}
          errorKey={list.errorKey}
          feedback={list.feedback}
          onDismissFeedback={list.dismissFeedback}
          onClaim={(ticketId) => void list.onClaim(ticketId)}
          onRetry={() => void list.load()}
        />
      ) : (
        <>
          <TicketWorkspaceNav
            view={list.view}
            inboxHidden={list.inboxHidden}
            isStaff={list.isStaff}
          />
          {/* UX 2026-10-02: one full-width column. Saved views used to sit in a
              permanent 220px rail, which squeezed the table on laptops and stacked
              above it on smaller screens; they are now a compact control inside the
              filter row (see `TicketSavedViewsMenu`). */}
          <div className="mt-4 min-w-0">
            <UnderlineTabs
              className="mb-3"
              active={ticketListTabKey(list.filters)}
              onChange={(key) => list.setFilters(applyTicketListTab(list.filters, key))}
              items={ticketStatusTabItems(t, list.counts, riskCount)}
            />
            <TicketListFiltersBar
              filters={list.filters}
              services={list.services}
              onChange={list.setFilters}
              isStaff={list.isStaff}
              savedViewsSlot={
                <TicketSavedViewsMenu
                  filters={list.filters}
                  onApply={list.setFilters}
                  onError={list.setErrorKey}
                />
              }
            />
            <TicketBulkBar
              selectedIds={list.selectedIds}
              ticketNumbers={new Map(list.pageItems.map((ticket) => [ticket.id, ticket.ticketNumber]))}
              ticketSummaries={
                new Map(
                  list.pageItems.map((ticket) => [
                    ticket.id,
                    { id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, priority: ticket.priority },
                  ]),
                )
              }
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
            ) : list.total === 0 ? (
              <div className="rounded-lg border border-border bg-surface shadow-card">
                <TicketEmptyState
                  title={t("tickets.emptyFilterTitle")}
                  body={t("tickets.emptyFilterHint")}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => list.setFilters(clearedTicketListFilters(list.filters, list.isStaff))}
                    >
                      {t("tickets.clearFilters")}
                    </Button>
                  }
                />
              </div>
            ) : (
              <TicketListTable
                tickets={list.pageItems}
                serviceNames={list.serviceNames}
                assigneeNames={assigneeNames}
                selectedIds={list.selectedIds}
                onToggleSelected={list.toggleSelected}
                onTogglePage={(selected) =>
                  list.setSelectedIds(
                    selected ? new Set(list.pageItems.map((ticket) => ticket.id)) : new Set(),
                  )
                }
              />
            )}
            {list.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted-foreground">
                <Button type="button" variant="outline" size="sm" disabled={list.page === 1} onClick={() => list.setPage(list.page - 1)}>
                  {t("tickets.previous")}
                </Button>
                <span className="tnum">{ticketText(t, list.totalIsCapped ? "tickets.pageCapped" : "tickets.page", { page: list.page, total: list.totalPages })}</span>
                <Button type="button" variant="outline" size="sm" disabled={list.page === list.totalPages} onClick={() => list.setPage(list.page + 1)}>
                  {t("tickets.next")}
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] text-muted-foreground">
                {ticketText(t, list.totalIsCapped ? "tickets.listShownCapped" : "tickets.listShown", { shown: list.pageItems.length, total: list.total })}
              </p>
            )}
            {canExport ? (
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {t("tickets.exportAuditedHint")}
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
