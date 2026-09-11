import { Filter, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  controlCompactClassName,
  filterChipActiveClassName,
  filterChipClassName,
  filterChipIdleClassName,
  selectCompactClassName,
} from "@/components/ui/control";
import { cn } from "@/lib/utils";
import { ticketPriorityValues, ticketPriorityLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface TicketListFiltersBarProperties {
  readonly filters: TicketListFilters;
  readonly services: readonly ServiceResponse[];
  readonly onChange: (filters: TicketListFilters) => void;
}

export function TicketListFiltersBar({
  filters,
  services,
  onChange,
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
        <button
          type="button"
          onClick={() => onChange({ ...filters, priority: "" })}
          className={cn(
            filterChipClassName,
            filters.priority === "" ? filterChipActiveClassName : filterChipIdleClassName,
          )}
        >
          {t("tickets.filters.priorityAll")}
        </button>
        {ticketPriorityValues.map((priority) => (
          <button
            key={priority}
            type="button"
            onClick={() => onChange({ ...filters, priority })}
            className={cn(
              filterChipClassName,
              filters.priority === priority
                ? filterChipActiveClassName
                : filterChipIdleClassName,
            )}
          >
            {ticketText(t, ticketPriorityLabelKey[priority])}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="ticket-list-service">
        {t("tickets.filters.service")}
      </label>
      <select
        id="ticket-list-service"
        className={cn(selectCompactClassName, "ml-auto w-auto min-w-[9rem]")}
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
