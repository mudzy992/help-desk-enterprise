import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import {
  canDeleteCatalogService,
  nextServiceLifecycleTargets,
  serviceLifecycleActionLabelKey,
} from "@/lib/services/allowed-service-lifecycle-transitions";
import {
  mapServiceCatalogError,
  type ServiceCatalogErrorKey,
} from "@/lib/services/map-service-catalog-error";
import { requireCatalogChangeReason } from "@/lib/services/require-catalog-change-reason";
import {
  deleteService,
  transitionServiceLifecycle,
  type ServiceResponse,
} from "@/services/service-catalog-api";

interface ServiceCatalogLifecycleActionsProperties {
  readonly service: ServiceResponse;
  readonly onChanged: () => Promise<void>;
  readonly onEdit: () => void;
  readonly canWriteAvailability?: boolean;
  readonly onScheduleDowntime?: () => void;
}

export function ServiceCatalogLifecycleActions({
  service,
  onChanged,
  onEdit,
  canWriteAvailability = false,
  onScheduleDowntime,
}: ServiceCatalogLifecycleActionsProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<ServiceCatalogErrorKey | null>(null);
  const reasonReady = requireCatalogChangeReason(reason) !== null;
  const targets = nextServiceLifecycleTargets(service.lifecycle);
  const canDelete = canDeleteCatalogService(service.lifecycle);

  const run = async (action: string, work: () => Promise<unknown>) => {
    if (!reasonReady) {
      return;
    }
    setPendingAction(action);
    setErrorKey(null);
    try {
      await work();
      setReason("");
      await onChanged();
    } catch (error) {
      setErrorKey(mapServiceCatalogError(error));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="fade-in grid w-full gap-2">
      <Field label={t("services.changeReason")} required>
        <Input
          value={reason}
          maxLength={512}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button type="button" size="xs" variant="outline" onClick={onEdit}>
          {t("services.editService")}
        </Button>
        {canWriteAvailability && onScheduleDowntime ? (
          <Button type="button" size="xs" variant="outline" onClick={onScheduleDowntime}>
            {t("services.downtime.schedule")}
          </Button>
        ) : null}
        {targets.map((target) => (
          <Button
            key={target}
            type="button"
            size="xs"
            variant="outline"
            disabled={!reasonReady || pendingAction !== null}
            onClick={() => {
              void run(target, () =>
                transitionServiceLifecycle(service.id, target),
              );
            }}
          >
            {t(serviceLifecycleActionLabelKey(service.lifecycle, target))}
          </Button>
        ))}
        {canDelete ? (
          <Button
            type="button"
            size="xs"
            variant="danger"
            disabled={!reasonReady || pendingAction !== null}
            onClick={() => {
              void run("delete", () => deleteService(service.id));
            }}
          >
            {pendingAction === "delete"
              ? t("services.deleting")
              : t("services.deleteDraft")}
          </Button>
        ) : null}
      </div>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
    </div>
  );
}
