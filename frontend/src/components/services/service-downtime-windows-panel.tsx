import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceDowntimeWindowForm } from "@/components/services/service-downtime-window-form";
import { ServiceDowntimeWindowRow } from "@/components/services/service-downtime-window-row";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  mapServiceCatalogError,
  type ServiceCatalogErrorKey,
} from "@/lib/services/map-service-catalog-error";
import { requireCatalogChangeReason } from "@/lib/services/require-catalog-change-reason";
import {
  deleteServiceDowntimeWindow,
  listManagedDowntimeWindows,
  listServiceDowntimeWindows,
  type DowntimeWindowResponse,
} from "@/services/service-downtime-api";

interface ServiceDowntimeWindowsPanelProperties {
  readonly serviceId: string;
  readonly onChanged: () => Promise<void>;
}

export function ServiceDowntimeWindowsPanel({
  serviceId,
  onChanged,
}: ServiceDowntimeWindowsPanelProperties) {
  const { t } = useTranslation();
  const [windows, setWindows] = useState<readonly DowntimeWindowResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<DowntimeWindowResponse | null | undefined>(
    undefined,
  );
  const [deleteReason, setDeleteReason] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<ServiceCatalogErrorKey | null>(null);
  const managed = listManagedDowntimeWindows(windows);
  const canCancel = requireCatalogChangeReason(deleteReason) !== null;

  const reload = async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      setWindows(await listServiceDowntimeWindows(serviceId));
    } catch (error) {
      setWindows([]);
      setErrorKey(mapServiceCatalogError(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [serviceId]);

  const cancelWindow = async (window: DowntimeWindowResponse) => {
    const reason = requireCatalogChangeReason(deleteReason);
    if (reason === null) {
      return;
    }
    setPendingDeleteId(window.id);
    setErrorKey(null);
    try {
      await deleteServiceDowntimeWindow(serviceId, window.id, reason);
      setDeleteReason("");
      await reload();
      await onChanged();
    } catch (error) {
      setErrorKey(mapServiceCatalogError(error));
    } finally {
      setPendingDeleteId(null);
    }
  };

  if (editing !== undefined) {
    return (
      <ServiceDowntimeWindowForm
        key={editing?.id ?? "create"}
        serviceId={serviceId}
        window={editing}
        onCancel={() => setEditing(undefined)}
        onSaved={async () => {
          setEditing(undefined);
          await reload();
          await onChanged();
        }}
      />
    );
  }

  if (isLoading) {
    return <PanelSkeleton className="mt-2" label={t("services.downtime.heading")} />;
  }

  return (
    <div className="fade-in grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">{t("services.downtime.listHint")}</p>
        <Button type="button" size="xs" onClick={() => setEditing(null)}>
          {t("services.downtime.schedule")}
        </Button>
      </div>
      {managed.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t("services.downtime.empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {managed.map((window) => (
            <ServiceDowntimeWindowRow
              key={window.id}
              window={window}
              canCancel={canCancel}
              isCancelling={pendingDeleteId === window.id}
              onEdit={() => setEditing(window)}
              onCancel={() => {
                void cancelWindow(window);
              }}
            />
          ))}
        </ul>
      )}
      <Field
        label={t("services.changeReason")}
        required
        hint={t("services.downtime.deleteReasonHint")}
      >
        <Input
          value={deleteReason}
          maxLength={512}
          onChange={(event) => setDeleteReason(event.target.value)}
        />
      </Field>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
    </div>
  );
}
