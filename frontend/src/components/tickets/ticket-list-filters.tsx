import type { TFunction } from "i18next";
import { Filter, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Chip } from "@/components/ui/chip";
import { controlCompactClassName, selectCompactClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";
import {
  ticketPriorityValues,
  ticketPriorityLabelKey,
  ticketStatusValues,
  ticketStatusLabelKey,
} from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { parseForwardedFilter, type TicketListFilters } from "@/lib/tickets/filter-tickets";
import type { ServiceResponse } from "@/services/service-catalog-api";
import type { TicketStatus } from "@/services/tickets-api";
import type { TicketCounts } from "@/services/tickets-counts-api";

const SLA_RISK_TAB = "RISK";

export function ticketListTabKey(filters: TicketListFilters): string {
  if (filters.overdue) {
    return SLA_RISK_TAB;
  }
  return filters.status === "" ? "ALL" : filters.status;
}

export function applyTicketListTab(
  filters: TicketListFilters,
  key: string,
): TicketListFilters {
  if (key === SLA_RISK_TAB) {
    return { ...filters, status: "", overdue: true };
  }
  return {
    ...filters,
    overdue: false,
    status: key === "ALL" ? "" : (key as TicketStatus),
  };
}

/**
 * Tab counters of the list.
 *
 * Phase 1.1 (plan §1.1): the counters no longer come from the downloaded list
 * (which is one page now) but from `GET /tickets/counts`, computed over the
 * same filters and visibility. `null` means the counters could not be read —
 * the tabs then show zeros instead of blocking the list.
 *
 * "All" is every status the counters know except ARCHIVED: the default list
 * hides the archive, and the counters group over all statuses.
 */
export function ticketStatusTabItems(
  t: TFunction,
  counts: TicketCounts | null,
  riskCount: number,
) {
  const allCount =
    counts === null
      ? 0
      : ticketStatusValues.reduce(
          (sum, status) =>
            status === "ARCHIVED" ? sum : sum + (counts.byStatus[status] ?? 0),
          0,
        );
  return [
    { key: "ALL", label: ticketText(t, "tickets.filters.allTickets"), count: allCount },
    {
      key: SLA_RISK_TAB,
      label: (
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
          {ticketText(t, "tickets.filters.slaRisk")}
        </span>
      ),
      count: riskCount,
    },
    ...ticketStatusValues.map((status) => ({
      key: status,
      label: ticketText(t, ticketStatusLabelKey[status]),
      count: counts?.byStatus[status] ?? 0,
    })),
  ];
}

interface TicketListFiltersBarProperties {
  readonly filters: TicketListFilters;
  readonly services: readonly ServiceResponse[];
  readonly onChange: (filters: TicketListFilters) => void;
  /** Package 1.6: the "forwarded" filter is staff-only. */
  readonly isStaff?: boolean;
}

export function TicketListFiltersBar({
  filters,
  services,
  onChange,
  isStaff = false,
}: TicketListFiltersBarProperties) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative w-64 max-w-full">
        <Search
          size={13.5}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="ticket-list-search">
          {t("tickets.filters.search")}
        </label>
        <input
          id="ticket-list-search"
          className={cn(controlCompactClassName, "pl-8")}
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder={t("tickets.filters.searchPlaceholder")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter size={13} className="text-muted-foreground/70" aria-hidden="true" />
        <Chip
          active={filters.priority === ""}
          onClick={() => onChange({ ...filters, priority: "" })}
        >
          {t("tickets.filters.priorityAll")}
        </Chip>
        {ticketPriorityValues.map((priority) => (
          <Chip
            key={priority}
            active={filters.priority === priority}
            onClick={() => onChange({ ...filters, priority })}
          >
            {ticketText(t, ticketPriorityLabelKey[priority])}
          </Chip>
        ))}
      </div>
      {isStaff ? (
        <>
          <label className="sr-only" htmlFor="ticket-list-forwarded">
            {t("tickets.forwarding.filterLabel")}
          </label>
          <select
            id="ticket-list-forwarded"
            data-testid="ticket-list-forwarded"
            className={cn(selectCompactClassName, "ml-auto w-auto min-w-[9rem]")}
            value={filters.forwarded ?? ""}
            onChange={(event) =>
              onChange({ ...filters, forwarded: parseForwardedFilter(event.target.value) })
            }
          >
            <option value="">{t("tickets.forwarding.filterAll")}</option>
            <option value="any">{t("tickets.forwarding.filterAny")}</option>
            <option value="toMyGroups">{t("tickets.forwarding.filterToMyGroups")}</option>
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              data-testid="ticket-list-hide-merged"
              checked={filters.hideMerged === true}
              onChange={(event) => onChange({ ...filters, hideMerged: event.target.checked })}
            />
            {t("tickets.merge.hideMerged")}
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-danger"
              data-testid="ticket-list-unrouted-overdue"
              checked={filters.unroutedOverdue === true}
              onChange={(event) => onChange({ ...filters, unroutedOverdue: event.target.checked })}
            />
            {t("tickets.unrouted.overdueFilter")}
          </label>
        </>
      ) : null}
      <label className="sr-only" htmlFor="ticket-list-service">
        {t("tickets.filters.service")}
      </label>
      <select
        id="ticket-list-service"
        className={cn(selectCompactClassName, isStaff ? "w-auto min-w-[9rem]" : "ml-auto w-auto min-w-[9rem]")}
        value={filters.serviceId}
        onChange={(event) => onChange({ ...filters, serviceId: event.target.value })}
      >
        <option value="">{t("tickets.filters.all")}</option>
        {services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </select>
    </div>
  );
}
