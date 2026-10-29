import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreateTicketServiceOption } from "@/components/tickets/create-ticket-service-option";
import { isServiceListedInMaintenance } from "@/lib/maintenance/parse-public-maintenance";
import {
  recentGroupKey,
  uncategorizedKey,
  type ServicePickerGroup,
} from "@/lib/tickets/service-picker-model";
import type { PublicMaintenanceState } from "@/lib/maintenance/parse-public-maintenance";

interface CreateTicketServiceGroupsProperties {
  readonly groups: readonly ServicePickerGroup[];
  readonly focusTargetId: string | null;
  readonly selectedId: string;
  readonly maintenance: PublicMaintenanceState;
  readonly onSelect: (serviceId: string) => void;
}

export function CreateTicketServiceGroups({
  groups,
  focusTargetId,
  selectedId,
  maintenance,
  onSelect,
}: CreateTicketServiceGroupsProperties) {
  const { t } = useTranslation();
  return groups.map((group) => (
    <section key={group.key} aria-labelledby={`service-group-${group.key}`}>
      <h3
        id={`service-group-${group.key}`}
        className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
      >
        {group.key === recentGroupKey ? <Clock size={11} aria-hidden="true" /> : null}
        {group.key === recentGroupKey
          ? t("tickets.servicePicker.recent")
          : group.key === uncategorizedKey
            ? t("tickets.servicePicker.uncategorized")
            : (group.name ?? "")}
        <span className="font-normal normal-case tracking-normal tnum">
          · {group.services.length}
        </span>
      </h3>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
        {group.services.map((service) => (
          <li key={service.id}>
            <CreateTicketServiceOption
              service={service}
              selected={service.id === selectedId}
              tabbable={`${group.key}:${service.id}` === focusTargetId}
              listedInMaintenance={isServiceListedInMaintenance(maintenance, service)}
              onSelect={() => onSelect(service.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  ));
}
