import { useTranslation } from "react-i18next";
import { ServiceCatalogLifecycleActions } from "@/components/services/service-catalog-lifecycle-actions";
import { Modal, ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface ServiceCatalogLifecycleDialogProperties {
  readonly service: ServiceResponse | null;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
}

export function ServiceCatalogLifecycleDialog({
  service,
  onClose,
  onChanged,
}: ServiceCatalogLifecycleDialogProperties) {
  const { t } = useTranslation();
  if (service === null) {
    return null;
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent className="max-w-xl" data-testid="service-lifecycle-dialog">
        <ModalTitle className="pr-6 text-[15px] font-semibold leading-5 text-foreground">
          {t("services.manageLifecycleTitle", { name: service.name })}
        </ModalTitle>
        <ModalDescription className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
          {t("services.manageLifecycleDescription", {
            lifecycle: t(`services.lifecycle.${service.lifecycle}`),
          })}
        </ModalDescription>
        <div className="mt-5">
          <ServiceCatalogLifecycleActions
            service={service}
            onChanged={onChanged}
            onClose={onClose}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
