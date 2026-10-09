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
  readonly onClose: () => void;
}

export function ServiceCatalogLifecycleActions({
  service,
  onChanged,
  onClose,
}: ServiceCatalogLifecycleActionsProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<ServiceCatalogErrorKey | null>(null);
  const reasonReady = requireCatalogChangeReason(reason) !== null;
  const targets = nextServiceLifecycleTargets(service.lifecycle);
  const canDelete = canDeleteCatalogService(service.lifecycle);

  const run = async (action: string, work: () => Promise<unknown>) => {
    if (!reasonReady || pendingAction !== null) {
      return;
    }
    setPendingAction(action);
    setErrorKey(null);
    try {
      await work();
      setReason("");
      await onChanged();
      onClose();
    } catch (error) {
      setErrorKey(mapServiceCatalogError(error));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="grid gap-4">
      <Field label={t("services.changeReason")} required>
        <Input
          value={reason}
          maxLength={512}
          disabled={pendingAction !== null}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {errorKey ? <p role="alert" className={errorTextClassName}>{t(errorKey)}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pendingAction !== null}
          onClick={onClose}
        >
          {t("services.cancel")}
        </Button>
        {targets.map((target) => (
          <Button
            key={target}
            type="button"
            size="sm"
            variant="outline"
            disabled={!reasonReady || pendingAction !== null}
            onClick={() => {
              void run(target, () => transitionServiceLifecycle(service.id, target));
            }}
          >
            {pendingAction === target
              ? t("services.savingService")
              : t(serviceLifecycleActionLabelKey(service.lifecycle, target))}
          </Button>
        ))}
        {canDelete ? (
          <Button
            type="button"
            size="sm"
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
    </div>
  );
}
