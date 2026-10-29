import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceDowntimeWindowForm } from "@/components/services/service-downtime-window-form";
import { ServiceDowntimeWindowRow } from "@/components/services/service-downtime-window-row";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useOperationGuard } from "@/lib/async/use-operation-guard";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { requireCatalogChangeReason } from "@/lib/services/require-catalog-change-reason";
import { useServiceDowntimeWindows } from "@/lib/services/use-service-downtime-windows";
import {
  deleteServiceDowntimeWindow,
  listManagedDowntimeWindows,
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
  const query = useServiceDowntimeWindows(serviceId);
  const operationGuard = useOperationGuard();
  const [editing, setEditing] = useState<DowntimeWindowResponse | null | undefined>(undefined);
  const [deleteReason, setDeleteReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<DowntimeWindowResponse | null>(null);
  const [mutationError, setMutationError] = useState<{
    readonly key: ApiErrorKey;
    readonly requestId: string | null;
  } | null>(null);
  const managed = listManagedDowntimeWindows(query.windows);
  const cancelReason = requireCatalogChangeReason(deleteReason);
  const cancelKey = cancelTarget === null ? null : `cancel:${serviceId}:${cancelTarget.id}`;
  const isCancelling = cancelKey !== null && operationGuard.isPending(cancelKey);

  const cancelWindow = async () => {
    if (cancelTarget === null || cancelReason === null || cancelKey === null) return;
    await operationGuard.run(cancelKey, async () => {
      setMutationError(null);
      try {
        await deleteServiceDowntimeWindow(serviceId, cancelTarget.id, cancelReason);
        setDeleteReason("");
        setCancelTarget(null);
        await query.reload();
        await onChanged();
      } catch (error) {
        setMutationError({ key: mapApiError(error), requestId: readApiRequestId(error) });
      }
    });
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
          await query.reload();
          await onChanged();
        }}
      />
    );
  }

  if (query.isLoading && !query.hasLoaded) {
    return <PanelSkeleton className="mt-2" label={t("services.downtime.heading")} />;
  }

  return (
    <div className="fade-in grid gap-3">
      {query.errorKey ? (
        <div className="grid gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          {query.hasLoaded ? (
            <p className="text-[11.5px] text-muted-foreground">
              {t("services.downtime.refreshWarning")}
            </p>
          ) : null}
          <ApiErrorText messageKey={query.errorKey} requestId={query.requestId} />
          <div>
            <Button type="button" size="xs" variant="outline" onClick={() => void query.reload()}>
              {t("services.retryLoad")}
            </Button>
          </div>
        </div>
      ) : null}
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
              canCancel={cancelReason !== null}
              isCancelling={operationGuard.isPending(`cancel:${serviceId}:${window.id}`)}
              onEdit={() => setEditing(window)}
              onCancel={() => {
                setMutationError(null);
                setCancelTarget(window);
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
        {(control) => (
          <Input
            {...control}
            value={deleteReason}
            maxLength={512}
            onChange={(event) => setDeleteReason(event.target.value)}
          />
        )}
      </Field>
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isCancelling) setCancelTarget(null);
        }}
        title={t("services.downtime.cancelConfirmTitle")}
        description={t("services.downtime.cancelConfirmDescription")}
        confirmLabel={t("services.downtime.cancelWindow")}
        intent="danger"
        isPending={isCancelling}
        onConfirm={() => void cancelWindow()}
      >
        {mutationError ? (
          <div className={errorTextClassName}>
            <ApiErrorText messageKey={mutationError.key} requestId={mutationError.requestId} />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
