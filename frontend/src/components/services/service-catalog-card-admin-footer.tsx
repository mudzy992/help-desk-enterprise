import { useTranslation } from "react-i18next";
import { ServiceCatalogLifecycleActions } from "@/components/services/service-catalog-lifecycle-actions";
import { Button } from "@/components/ui/button";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface ServiceCatalogCardAdminFooterProperties {
  readonly service: ServiceResponse;
  readonly canManageForms: boolean;
  readonly canWriteCatalog: boolean;
  readonly canWriteAvailability: boolean;
  readonly pendingServiceId: string | null;
  readonly onPrepareForm: (serviceId: string) => void;
  readonly onEdit: (service: ServiceResponse) => void;
  readonly onStartOnboarding: (serviceId: string) => void;
  readonly onManageDowntime: (service: ServiceResponse) => void;
  readonly onCatalogChanged: () => Promise<void>;
}

export function ServiceCatalogCardAdminFooter({
  service,
  canManageForms,
  canWriteCatalog,
  canWriteAvailability,
  pendingServiceId,
  onPrepareForm,
  onEdit,
  onStartOnboarding,
  onManageDowntime,
  onCatalogChanged,
}: ServiceCatalogCardAdminFooterProperties) {
  const { t } = useTranslation();
  if (!canWriteCatalog && !canWriteAvailability) {
    return null;
  }
  return (
    <div className="border-t border-border/50 px-4 py-2.5">
      {canWriteCatalog ? (
        <ServiceCatalogLifecycleActions
          service={service}
          onChanged={onCatalogChanged}
          onEdit={() => onEdit(service)}
          canWriteAvailability={canWriteAvailability}
          onScheduleDowntime={() => onManageDowntime(service)}
        />
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => onManageDowntime(service)}
          >
            {t("services.downtime.schedule")}
          </Button>
        </div>
      )}
      {canWriteCatalog ? (
        <div className="mt-2 flex justify-end gap-1.5">
          {service.lifecycle === "DRAFT" ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onStartOnboarding(service.id)}
            >
              {t("services.startOnboarding")}
            </Button>
          ) : null}
          {canManageForms ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={pendingServiceId !== null}
              onClick={() => onPrepareForm(service.id)}
            >
              {pendingServiceId === service.id
                ? t("services.preparingForm")
                : t("services.manageForm")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
