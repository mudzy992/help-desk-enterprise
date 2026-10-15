import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallBusinessHoursEditor } from "@/components/install/install-business-hours-editor";
import { InstallPriorityMatrixPreview } from "@/components/install/install-priority-matrix-preview";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallContentSaveError,
  type InstallContentErrorKey,
} from "@/lib/install/map-install-content-save-error";
import {
  hasWorkingDay,
  isSameInstallWeeklyHours,
  toInstallWeekdayRows,
  toInstallWeeklyHours,
  type InstallWeekdayRow,
} from "@/lib/install/install-weekly-hours";
import {
  loadInstallSlaReview,
  saveInstallSlaReview,
  type InstallSlaReviewCalendar,
  type InstallSlaReviewOutcome,
} from "@/services/install-content-api";

/*
  Install wizard v2 (F4.4): „Provjerite i potvrdite“ instead of „nadamo se da je
  dobro“. One button: with no edits it records „I confirm the defaults“ (the step
  is answered, nothing is written); with edits it saves the week and records that
  the values were adjusted. The matrix is shown, not edited — changing a cell has
  to be a deliberate act with a reason, and that lives on the SLA screen.
*/
export function InstallSlaReviewStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<readonly InstallWeekdayRow[] | null>(null);
  const [calendar, setCalendar] = useState<InstallSlaReviewCalendar | null>(null);
  const [review, setReview] = useState<InstallSlaReviewOutcome | null>(null);
  const [errorKey, setErrorKey] = useState<InstallContentErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The loaded status seeds the week once; after a save the response is the truth.
  const [isSeeded, setIsSeeded] = useState(false);
  const resource = useInstallStepResource(loadInstallSlaReview);

  useEffect(() => {
    if (resource.status !== "ready" || isSeeded) {
      return;
    }
    setCalendar(resource.data.calendar);
    setReview(resource.data.review);
    setRows(
      resource.data.calendar === null
        ? null
        : toInstallWeekdayRows(resource.data.calendar.weeklyHours),
    );
    setIsSeeded(true);
  }, [isSeeded, resource]);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const baselineHours = calendar?.weeklyHours ?? {};
  const hasChanges =
    rows !== null && !isSameInstallWeeklyHours(toInstallWeeklyHours(rows), baselineHours);
  const canSubmit = rows === null || hasWorkingDay(rows);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const result = await saveInstallSlaReview(
        rows !== null && hasChanges
          ? { outcome: "adjusted", weeklyHours: toInstallWeeklyHours(rows) }
          : { outcome: "confirmed" },
      );
      setReview(result.review);
      setCalendar(result.calendar);
      setRows(result.calendar === null ? null : toInstallWeekdayRows(result.calendar.weeklyHours));
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallContentSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">{t("install.slaReview.body")}</p>
      {review !== null ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t(`install.slaReview.review.${review}`)}
        </p>
      ) : null}
      {calendar === null ? (
        <p className={hintClassName}>{t("install.slaReview.errorCalendarMissing")}</p>
      ) : (
        <section className="grid gap-2 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t("install.slaReview.calendar.title", { name: calendar.name })}
          </h3>
          <p className={hintClassName}>
            {t("install.slaReview.calendar.timezone", { timezone: calendar.timezone })}
            {" · "}
            {t("install.slaReview.calendar.holidays", { count: calendar.holidays.length })}
          </p>
          {rows === null ? null : (
            <InstallBusinessHoursEditor rows={rows} isDisabled={isSubmitting} onChange={setRows} />
          )}
          {rows !== null && !hasWorkingDay(rows) ? (
            <p className={errorTextClassName}>{t("install.slaReview.errorHours")}</p>
          ) : null}
        </section>
      )}
      <section className="grid gap-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-semibold text-foreground">
          {t("install.slaReview.matrix.title")}
        </h3>
        <InstallPriorityMatrixPreview cells={resource.data.matrix.cells} />
      </section>
      {errorKey !== null ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !canSubmit}>
          {isSubmitting
            ? t("install.saving")
            : hasChanges
              ? t("install.slaReview.submitAdjust")
              : t("install.slaReview.confirm")}
        </Button>
      </div>
    </form>
  );
}
