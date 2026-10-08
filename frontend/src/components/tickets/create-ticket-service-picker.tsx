import { Check, Clock, Search, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { controlClassName } from "@/components/ui/control";
import { usePublicMaintenance } from "@/lib/maintenance/use-public-maintenance";
import { isServiceListedInMaintenance } from "@/lib/maintenance/parse-public-maintenance";
import { useSession } from "@/lib/session/use-session";
import { readRecentServices, rememberRecentService } from "@/lib/tickets/recent-services-storage";
import {
  buildServiceChips,
  buildServiceGroups,
  recentGroupKey,
  uncategorizedKey,
  type ServicePickerGroup,
} from "@/lib/tickets/service-picker-model";
import { cn } from "@/lib/utils";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { ServiceResponse } from "@/services/service-catalog-api";

const availabilityTone: Record<
  ServiceResponse["availability"],
  "success" | "warning" | "danger" | "info"
> = {
  OPERATIONAL: "success",
  DEGRADED: "warning",
  DOWN: "danger",
  MAINTENANCE: "info",
};

/** Paket 2.7: an open incident raises the shown availability (stored value unchanged). */
function shownAvailability(service: ServiceResponse): ServiceResponse["availability"] {
  return service.incidentImpact == null
    ? service.availability
    : (service.runtimeAvailability.effectiveAvailability ?? service.availability);
}

/** Chips are worth showing only when there is more than one category. */
const minCategoriesForChips = 2;

interface CreateTicketServicePickerProperties {
  readonly services: readonly ServiceResponse[];
  readonly selectedId: string;
  readonly onSelect: (serviceId: string) => void;
}

/**
 * Paket 5.3.1 (D9): service step of ticket creation — search, category chips
 * and a compact list grouped by category, with recently used services first.
 * Scales to 100+ services: one flat render, no per-row effects.
 *
 * Keyboard: ↓ from the search box enters the list; ↑/↓/Home/End move between
 * services (roving tab index, one tab stop); Enter/Space selects; ↑ on the
 * first service goes back to the search.
 */
export function CreateTicketServicePicker({
  services,
  selectedId,
  onSelect,
}: CreateTicketServicePickerProperties) {
  const { t } = useTranslation();
  const { maintenance } = usePublicMaintenance();
  const { currentUserId } = useSession();
  const [query, setQuery] = useState("");
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState(() => readRecentServices(currentUserId));
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const chips = useMemo(() => buildServiceChips(services, query), [services, query]);
  // A chip that the search emptied must not leave the list blank.
  const activeCategory = categoryKey !== null && chips.some((chip) => chip.key === categoryKey) ? categoryKey : null;
  const groups = useMemo(
    () => buildServiceGroups({ services, query, categoryKey: activeCategory, recentIds }),
    [services, query, activeCategory, recentIds],
  );
  const visibleCount = useMemo(
    () => new Set(groups.filter((group) => group.key !== recentGroupKey).flatMap((group) => group.services.map((item) => item.id))).size,
    [groups],
  );
  const focusTargetId = useMemo(() => {
    const ids = groups.flatMap((group) => group.services.map((item) => `${group.key}:${item.id}`));
    return ids.find((id) => id.endsWith(`:${selectedId}`)) ?? ids[0] ?? null;
  }, [groups, selectedId]);

  const select = (serviceId: string) => {
    onSelect(serviceId);
    setRecentIds(rememberRecentService(currentUserId, serviceId));
  };

  const options = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-service-option]") ?? [])];

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = options();
    const index = all.findIndex((element) => element === document.activeElement);
    if (index === -1) return;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = Math.min(index + 1, all.length - 1);
    else if (event.key === "ArrowUp") {
      if (index === 0) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      next = index - 1;
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = all.length - 1;
    if (next !== null) {
      event.preventDefault();
      all[next]?.focus();
    }
  };

  const groupLabel = (group: ServicePickerGroup) =>
    group.key === recentGroupKey
      ? t("tickets.servicePicker.recent")
      : group.key === uncategorizedKey
        ? t("tickets.servicePicker.uncategorized")
        : (group.name ?? "");

  return (
    <div className="p-4 sm:p-5">
      <h2 className="text-[14px] font-semibold text-foreground">
        {t("tickets.pickService")}
      </h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {t("tickets.pickServiceHint")}
      </p>

      <div className="relative mt-3">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor="create-ticket-service-search" className="sr-only">
          {t("tickets.servicePicker.search")}
        </label>
        <input
          ref={searchRef}
          id="create-ticket-service-search"
          data-testid="service-picker-search"
          type="search"
          autoComplete="off"
          className={cn(controlClassName, "pl-9 pr-9")}
          placeholder={t("tickets.servicePicker.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              options()[0]?.focus();
            } else if (event.key === "Escape" && query !== "") {
              event.preventDefault();
              setQuery("");
            }
          }}
          aria-describedby="create-ticket-service-count"
        />
        {query !== "" ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            aria-label={t("tickets.servicePicker.clearSearch")}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary/70"
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {chips.length >= minCategoriesForChips ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={t("tickets.servicePicker.categories")}>
          <Chip active={activeCategory === null} onClick={() => setCategoryKey(null)}>
            {t("tickets.servicePicker.allCategories")}
            <span className="ml-1 tnum text-muted-foreground">{chips.reduce((sum, chip) => sum + chip.count, 0)}</span>
          </Chip>
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              active={activeCategory === chip.key}
              onClick={() => setCategoryKey(activeCategory === chip.key ? null : chip.key)}
            >
              {chip.key === uncategorizedKey ? t("tickets.servicePicker.uncategorized") : chip.name}
              <span className="ml-1 tnum text-muted-foreground">{chip.count}</span>
            </Chip>
          ))}
        </div>
      ) : null}

      <p id="create-ticket-service-count" className="sr-only" aria-live="polite">
        {t("tickets.servicePicker.resultCount", { count: visibleCount })}
      </p>

      {groups.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center" data-testid="service-picker-empty">
          <p className="text-[13px] font-medium text-foreground">
            {t("tickets.servicePicker.emptyTitle", { query: query.trim() })}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">{t("tickets.servicePicker.emptyHint")}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setQuery("");
              setCategoryKey(null);
              searchRef.current?.focus();
            }}
          >
            {t("tickets.servicePicker.clearSearch")}
          </Button>
        </div>
      ) : (
        <div
          ref={listRef}
          role="radiogroup"
          aria-label={t("tickets.pickService")}
          onKeyDown={onListKeyDown}
          className="mt-3 grid gap-3"
          data-testid="service-picker-list"
        >
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`service-group-${group.key}`}>
              <h3
                id={`service-group-${group.key}`}
                className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
              >
                {group.key === recentGroupKey ? <Clock size={11} aria-hidden="true" /> : null}
                {groupLabel(group)}
                <span className="font-normal normal-case tracking-normal tnum">· {group.services.length}</span>
              </h3>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
                {group.services.map((service) => (
                  <li key={service.id}>
                    <ServiceOption
                      service={service}
                      selected={service.id === selectedId}
                      tabbable={`${group.key}:${service.id}` === focusTargetId}
                      listedInMaintenance={isServiceListedInMaintenance(maintenance, service)}
                      onSelect={() => select(service.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceOption({
  service,
  selected,
  tabbable,
  listedInMaintenance,
  onSelect,
}: {
  readonly service: ServiceResponse;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly listedInMaintenance: boolean;
  readonly onSelect: () => void;
}) {
  const { t } = useTranslation();
  const availability = shownAvailability(service);
  const isUnavailable =
    service.runtimeAvailability.showStatusInTicketCreate && service.runtimeAvailability.isCurrentlyUnavailable;
  const showSettingsHint = listedInMaintenance && service.availability !== "MAINTENANCE";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      data-service-option
      data-testid={`service-option-${service.slug}`}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary/70",
        selected ? "bg-primary/10" : "bg-surface hover:bg-surface-hover",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-line-strong",
        )}
        aria-hidden="true"
      >
        {selected ? <Check size={10} strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-5 text-foreground">{service.name}</span>
        {isUnavailable ? (
          <span className="mt-0.5 block text-[11.5px] text-warning">{t("tickets.availabilityUnavailable")}</span>
        ) : null}
        {showSettingsHint ? (
          <span className="mt-0.5 block text-[11.5px] text-warning">{t("maintenance.serviceHint")}</span>
        ) : null}
        {service.requiresApproval ? (
          <span className="mt-0.5 block text-[11px] text-warning">
            {ticketText(t, "tickets.approvalsNeeded", { count: 1 })}
          </span>
        ) : null}
      </span>
      {availability !== "OPERATIONAL" ? (
        <Badge tone={availabilityTone[availability]} className="shrink-0 text-[10px]">
          {availability}
        </Badge>
      ) : null}
    </button>
  );
}
