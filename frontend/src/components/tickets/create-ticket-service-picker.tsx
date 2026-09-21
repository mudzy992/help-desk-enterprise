import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { usePublicMaintenance } from "@/lib/maintenance/use-public-maintenance";
import { isServiceListedInMaintenance } from "@/lib/maintenance/parse-public-maintenance";
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

interface CreateTicketServicePickerProperties {
  readonly services: readonly ServiceResponse[];
  readonly selectedId: string;
  readonly onSelect: (serviceId: string) => void;
}

export function CreateTicketServicePicker({
  services,
  selectedId,
  onSelect,
}: CreateTicketServicePickerProperties) {
  const { t } = useTranslation();
  const { maintenance } = usePublicMaintenance();
  return (
    <div className="p-5">
      <h2 className="text-[14px] font-semibold text-foreground">
        {t("tickets.pickService")}
      </h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {t("tickets.pickServiceHint")}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {services.map((service) => {
          const selected = selectedId === service.id;
          const listedInMaintenance = isServiceListedInMaintenance(
            maintenance,
            service,
          );
          const showSettingsHint =
            listedInMaintenance && service.availability !== "MAINTENANCE";
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onSelect(service.id)}
              className={cn(
                "rounded-lg border p-3.5 text-left transition-all duration-150",
                selected
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-background/40 hover:border-[#31405C] hover:bg-elevated/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">
                  {service.name}
                </span>
                {selected ? (
                  <span className="flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check size={11} />
                  </span>
                ) : (
                  <Badge
                    tone={availabilityTone[service.availability]}
                    dot={false}
                    className="text-[10px]"
                  >
                    {service.availability}
                  </Badge>
                )}
              </div>
              {service.runtimeAvailability.showStatusInTicketCreate &&
              service.runtimeAvailability.isCurrentlyUnavailable ? (
                <p className="mt-2 text-[11.5px] text-warning">
                  {t("tickets.availabilityUnavailable")}
                </p>
              ) : null}
              {showSettingsHint ? (
                <p className="mt-2 text-[11.5px] text-warning">
                  {t("maintenance.serviceHint")}
                </p>
              ) : null}
              {service.requiresApproval ? (
                <p className="mt-2 text-[10.5px] text-warning/90">
                  {ticketText(t, "tickets.approvalsNeeded", { count: 1 })}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
