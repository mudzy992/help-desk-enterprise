import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/services/downtime-datetime";
import {
  mapServiceCatalogError,
  type ServiceCatalogErrorKey,
} from "@/lib/services/map-service-catalog-error";
import { requireCatalogChangeReason } from "@/lib/services/require-catalog-change-reason";
import {
  createServiceDowntimeWindow,
  updateServiceDowntimeWindow,
  type DowntimeWindowResponse,
} from "@/services/service-downtime-api";

type FormValues = {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly message: string;
  readonly reason: string;
};

interface ServiceDowntimeWindowFormProperties {
  readonly serviceId: string;
  readonly window: DowntimeWindowResponse | null;
  readonly onCancel: () => void;
  readonly onSaved: () => Promise<void>;
}

function initialValues(window: DowntimeWindowResponse | null): FormValues {
  if (window === null) {
    return { startsAt: "", endsAt: "", message: "", reason: "" };
  }
  return {
    startsAt: toDatetimeLocalValue(window.startsAt),
    endsAt: toDatetimeLocalValue(window.endsAt),
    message: window.message,
    reason: "",
  };
}

export function ServiceDowntimeWindowForm({
  serviceId,
  window,
  onCancel,
  onSaved,
}: ServiceDowntimeWindowFormProperties) {
  const { t } = useTranslation();
  const [values, setValues] = useState<FormValues>(() => initialValues(window));
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ServiceCatalogErrorKey | null>(null);
  const canSubmit =
    requireCatalogChangeReason(values.reason) !== null &&
    values.startsAt.length > 0 &&
    values.endsAt.length > 0 &&
    values.message.trim().length > 0 &&
    !isSaving;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setIsSaving(true);
    setErrorKey(null);
    const payload = {
      startsAt: fromDatetimeLocalValue(values.startsAt),
      endsAt: fromDatetimeLocalValue(values.endsAt),
      message: values.message.trim(),
      reason: values.reason.trim(),
    };
    try {
      if (window === null) {
        await createServiceDowntimeWindow(serviceId, payload);
      } else {
        await updateServiceDowntimeWindow(serviceId, window.id, payload);
      }
      await onSaved();
    } catch (error) {
      setErrorKey(mapServiceCatalogError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const patch = (partial: Partial<FormValues>) => {
    setValues((current) => ({ ...current, ...partial }));
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t("services.downtime.startsAt")} required>
        <Input
          type="datetime-local"
          value={values.startsAt}
          onChange={(event) => patch({ startsAt: event.target.value })}
        />
      </Field>
      <Field label={t("services.downtime.endsAt")} required>
        <Input
          type="datetime-local"
          value={values.endsAt}
          onChange={(event) => patch({ endsAt: event.target.value })}
        />
      </Field>
      <Field label={t("services.downtime.message")} required>
        <Textarea
          value={values.message}
          maxLength={512}
          rows={3}
          onChange={(event) => patch({ message: event.target.value })}
        />
      </Field>
      <Field label={t("services.changeReason")} required>
        <Input
          value={values.reason}
          maxLength={512}
          onChange={(event) => patch({ reason: event.target.value })}
        />
      </Field>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t("services.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {isSaving
            ? t("services.downtime.saving")
            : t(window === null ? "services.downtime.schedule" : "services.downtime.save")}
        </Button>
      </div>
    </form>
  );
}
