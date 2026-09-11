import { useTranslation } from "react-i18next";
import {
  ticketPriorityValues,
  ticketStatusValues,
} from "@/lib/tickets/ticket-constants";
import type { TicketListFilters } from "@/lib/tickets/filter-tickets";
import type { ServiceResponse } from "@/services/service-catalog-api";

const fieldClass =
  "h-8 rounded-md border border-input bg-surface px-2 text-metadata text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
    <div className="mt-4 grid gap-2 md:grid-cols-4">
      <label className="grid gap-1 text-metadata text-muted-foreground">
        {t("tickets.filters.search")}
        <input
          className={fieldClass}
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder={t("tickets.filters.searchPlaceholder")}
        />
      </label>
      <label className="grid gap-1 text-metadata text-muted-foreground">
        {t("tickets.filters.status")}
        <select
          className={fieldClass}
          value={filters.status}
          onChange={(event) =>
            onChange({
              ...filters,
              status: event.target.value as TicketListFilters["status"],
            })
          }
        >
          <option value="">{t("tickets.filters.all")}</option>
          {ticketStatusValues.map((status) => (
            <option key={status} value={status}>
              {t(`tickets.status.${status}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-metadata text-muted-foreground">
        {t("tickets.filters.priority")}
        <select
          className={fieldClass}
          value={filters.priority}
          onChange={(event) =>
            onChange({
              ...filters,
              priority: event.target.value as TicketListFilters["priority"],
            })
          }
        >
          <option value="">{t("tickets.filters.all")}</option>
          {ticketPriorityValues.map((priority) => (
            <option key={priority} value={priority}>
              {t(`tickets.priority.${priority}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-metadata text-muted-foreground">
        {t("tickets.filters.service")}
        <select
          className={fieldClass}
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
      </label>
    </div>
  );
}
