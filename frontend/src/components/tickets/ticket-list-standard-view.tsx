import { useTranslation } from "react-i18next";
import {
  TicketErrorState,
  TicketEmptyState,
  TicketLoadingState,
} from "@/components/tickets/ticket-feedback-states";
import {
  TicketListFiltersBar,
  applyTicketListTab,
  ticketListTabKey,
  ticketStatusTabItems,
} from "@/components/tickets/ticket-list-filters";
import { TicketListTable } from "@/components/tickets/ticket-list-table";
import { TicketBulkBar } from "@/components/tickets/ticket-bulk-bar";
import { TicketCsvExportAuditHint } from "@/components/tickets/ticket-csv-export-controls";
import { TicketSavedViewsMenu } from "@/components/tickets/ticket-saved-views-menu";
import { Button } from "@/components/ui/button";
import { UnderlineTabs } from "@/components/ui/tabs";
import { clearedTicketListFilters, hasActiveTicketFilters } from "@/lib/tickets/filter-tickets";
import { useTicketList } from "@/components/tickets/hooks/use-ticket-list";

interface TicketListStandardViewProperties {
  readonly list: ReturnType<typeof useTicketList>;
  readonly assigneeNames: ReadonlyMap<string, string>;
  readonly canExport: boolean;
}

export function TicketListStandardView({
  list,
  assigneeNames,
  canExport,
}: TicketListStandardViewProperties) {
  const { t } = useTranslation();
  const riskCount = list.counts?.overdue ?? 0;

  return (
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
        onSearchChange={list.setSearch}
        isStaff={list.isStaff}
        savedViewsSlot={
          <TicketSavedViewsMenu
            filters={list.filters}
            onApply={list.setFilters}
            onError={list.setErrorKey}
          />
        }
      />
      {list.catalogErrorKey !== null ? (
        <div className="mt-3">
          <TicketErrorState errorKey={list.catalogErrorKey} onRetry={() => void list.load()} />
        </div>
      ) : null}
      <TicketBulkBar
        selectedIds={list.selectedIds}
        ticketNumbers={new Map(list.pageItems.map((ticket) => [ticket.id, ticket.ticketNumber]))}
        ticketSummaries={
          new Map(
            list.pageItems.map((ticket) => [
              ticket.id,
              {
                id: ticket.id,
                ticketNumber: ticket.ticketNumber,
                title: ticket.title,
                priority: ticket.priority,
              },
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
            title={
              hasActiveTicketFilters(list.filters)
                ? t("tickets.emptyFilterTitle")
                : t("tickets.emptyListTitle")
            }
            body={
              hasActiveTicketFilters(list.filters)
                ? t("tickets.emptyFilterHint")
                : t("tickets.emptyListHint")
            }
            action={
              hasActiveTicketFilters(list.filters) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    list.setFilters(clearedTicketListFilters(list.filters, list.isStaff))
                  }
                >
                  {t("tickets.clearFilters")}
                </Button>
              ) : undefined
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={list.page === 1}
            onClick={() => list.setPage(list.page - 1)}
          >
            {t("tickets.previous")}
          </Button>
          <span className="tnum">
            {t(list.totalIsCapped ? "tickets.pageCapped" : "tickets.page", {
              page: list.page,
              total: list.totalPages,
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={list.page === list.totalPages}
            onClick={() => list.setPage(list.page + 1)}
          >
            {t("tickets.next")}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          {t(list.totalIsCapped ? "tickets.listShownCapped" : "tickets.listShown", {
            shown: list.pageItems.length,
            total: list.total,
          })}
        </p>
      )}
      <TicketCsvExportAuditHint canExport={canExport} />
    </div>
  );
}
