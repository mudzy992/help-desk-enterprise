import { useMemo } from "react";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketInboxPanel } from "@/components/tickets/ticket-inbox-panel";
import { TicketCsvExportAction } from "@/components/tickets/ticket-csv-export-controls";
import { TicketListStandardView } from "@/components/tickets/ticket-list-standard-view";
import { directoryAssigneeNames } from "@/components/tickets/ticket-list-table";
import { TicketWorkspaceNav } from "@/components/tickets/ticket-workspace-nav";
import { Button } from "@/components/ui/button";
import { PageHeader, brandCrumb } from "@/components/layout/page-header";
import { useDirectory } from "@/lib/directory/use-directory";
import { useSidebarTicketCounts } from "@/lib/tickets/use-sidebar-ticket-counts";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { ticketViewLabelKey } from "@/lib/tickets/ticket-constants";
import { defaultInboxTab } from "@/lib/tickets/filter-tickets";
import { useTicketList } from "@/components/tickets/hooks/use-ticket-list";
import { useTicketsCsvExport } from "@/lib/tickets/use-tickets-csv-export";

export function TicketListPage() {
  const { t } = useTranslation();
  const list = useTicketList();
  const directory = useDirectory();
  const { hasPermission } = useSessionCapabilities();
  const canExport = hasPermission(permissionKeys.auditExport);
  const canManageGroups = hasPermission(permissionKeys.groupManage);
  const csvExport = useTicketsCsvExport(list.filters, list.setErrorKey);
  const workspaceCounts = useSidebarTicketCounts(list.isStaff);
  const isInbox = list.view === "inbox";
  const inboxActiveTab = list.filters.inboxTab ?? defaultInboxTab;
  const assigneeNames = useMemo(() => directoryAssigneeNames(directory.users), [directory.users]);
  const originNames = useMemo(
    () => flattenOrganizationalUnitNames(directory.tree),
    [directory.tree],
  );
  // the headline numbers come from the server counters (they cover
  // every matching ticket), not from the rows of the current page.
  const pageTitle = isInbox ? t("tickets.views.all") : t(ticketViewLabelKey[list.view]);
  const pageSubtitle = isInbox
    ? t("tickets.inboxHint")
    : list.counts === null
      ? t("tickets.listSubtitleCountsUnavailable")
      : t("tickets.listSubtitle", {
          open: list.counts.open,
          risk: list.counts.overdue,
        });
  const listHealthWarning =
    list.refreshErrorKey !== null
      ? t("tickets.refreshUnavailable")
      : list.countsErrorKey !== null
        ? t("tickets.countsUnavailable")
        : null;
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
            {!isInbox ? (
              <TicketCsvExportAction
                canExport={canExport}
                isExporting={csvExport.isExporting}
                onExport={() => void csvExport.run()}
              />
            ) : null}
            <Button asChild size="sm" variant="primary">
              <Link to="/tickets/new">
                <Plus size={14} /> {t("tickets.createAction")}
              </Link>
            </Button>
          </>
        }
      />
      <TicketWorkspaceNav
        view={list.view}
        inboxHidden={list.inboxHidden}
        isStaff={list.isStaff}
        counts={workspaceCounts}
      />
      {listHealthWarning !== null ? (
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[11.5px] text-warning"
          role="alert"
          data-testid="ticket-list-health-warning"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} aria-hidden="true" />
            {listHealthWarning}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void list.load()}>
            {t("tickets.retry")}
          </Button>
        </div>
      ) : null}
      {isInbox ? (
        <TicketInboxPanel
          activeTab={inboxActiveTab}
          onChangeTab={list.setInboxTab}
          inboxTickets={list.pageItems}
          inboxGroupCounts={list.inboxGroupCounts}
          inboxPage={list.page}
          inboxTotalPages={list.totalPages}
          inboxTotalIsCapped={list.totalIsCapped}
          onChangeInboxPage={list.setPage}
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
          catalogErrorKey={list.catalogErrorKey}
          unroutedErrorKey={list.unroutedErrorKey}
          membershipErrorKey={list.membershipErrorKey}
          onClaim={(ticketId) => void list.onClaim(ticketId)}
          onRetry={() => void list.load()}
        />
      ) : (
        <TicketListStandardView list={list} assigneeNames={assigneeNames} canExport={canExport} />
      )}
    </section>
  );
}
