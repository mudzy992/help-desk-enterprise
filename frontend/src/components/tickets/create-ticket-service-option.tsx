import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

function shownAvailability(service: ServiceResponse): ServiceResponse["availability"] {
  return service.incidentImpact == null
    ? service.availability
    : (service.runtimeAvailability.effectiveAvailability ?? service.availability);
}

interface CreateTicketServiceOptionProperties {
  readonly service: ServiceResponse;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly listedInMaintenance: boolean;
  readonly onSelect: () => void;
}

export function CreateTicketServiceOption({
  service,
  selected,
  tabbable,
  listedInMaintenance,
  onSelect,
}: CreateTicketServiceOptionProperties) {
  const { t } = useTranslation();
  const availability = shownAvailability(service);
  const isUnavailable =
    service.runtimeAvailability.showStatusInTicketCreate &&
    service.runtimeAvailability.isCurrentlyUnavailable;
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
        <span className="block text-[13px] font-medium leading-5 text-foreground">
          {service.name}
        </span>
        {isUnavailable ? (
          <span className="mt-0.5 block text-[11.5px] text-warning">
            {t("tickets.availabilityUnavailable")}
          </span>
        ) : null}
        {showSettingsHint ? (
          <span className="mt-0.5 block text-[11.5px] text-warning">
            {t("maintenance.serviceHint")}
          </span>
        ) : null}
        {service.requiresApproval ? (
          <span className="mt-0.5 block text-[11px] text-warning">
            {t("tickets.approvalsNeeded", { count: 1 })}
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
