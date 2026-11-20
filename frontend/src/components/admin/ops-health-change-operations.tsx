import { useTranslation } from "react-i18next";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { MetricTile } from "@/components/admin/ops-health-problem-operations";
import type { OpsOverview } from "@/services/ops-health-api";

/**
 * W7.69 (`BA-changes-13`): the change sweep and the downtime outbox are jobs; this
 * section shows their *outcomes* — reminders that are due but not marked, the
 * overruns nobody warned about, reminder dispatches that are queued or abandoned,
 * and downtime windows that no longer match the plan.
 *
 * The tile is the problem-operations one: same measurements, same tone language.
 */
export function ChangeOperationsSummary({ overview }: { readonly overview: OpsOverview }) {
  const { t } = useTranslation();
  const metrics = overview.components.changeOperations ?? null;
  const minutes = (value: number | null) =>
    value === null
      ? t("admin.opsHealth.changeOperations.unknown")
      : t("admin.opsHealth.changeOperations.minutesValue", { minutes: value });
  const delivery = metrics?.delivery ?? null;
  const driftPass = metrics?.downtime.lastPass ?? null;

  return (
    <section className="grid gap-2" data-testid="ops-health-changes">
      <div>
        <h4 className={sectionTitleClassName}>{t("admin.opsHealth.changeOperations.title")}</h4>
        <p className={hintClassName}>{t("admin.opsHealth.changeOperations.hint")}</p>
      </div>
      {metrics === null ? (
        <p className={hintClassName}>{t("admin.opsHealth.changeOperations.unavailable")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile
              label={t("admin.opsHealth.changeOperations.dueReminders")}
              state={
                metrics.reminders.dueReminders === null
                  ? "unknown"
                  : metrics.reminders.dueReminders > 0
                    ? "warning"
                    : "ok"
              }
              value={
                metrics.reminders.dueReminders === null
                  ? t("admin.opsHealth.changeOperations.unknown")
                  : t("admin.opsHealth.changeOperations.countValue", {
                      count: metrics.reminders.dueReminders,
                    })
              }
            />
            <MetricTile
              label={t("admin.opsHealth.changeOperations.upcoming24h")}
              state={metrics.reminders.upcoming24h > 0 ? "warning" : "ok"}
              value={t("admin.opsHealth.changeOperations.countValue", {
                count: metrics.reminders.upcoming24h,
              })}
            />
            <MetricTile
              label={t("admin.opsHealth.changeOperations.overdueOpen")}
              state={metrics.reminders.overdueOpen > 0 ? "warning" : "ok"}
              value={t("admin.opsHealth.changeOperations.countValue", {
                count: metrics.reminders.overdueOpen,
              })}
            />
            <MetricTile
              label={t("admin.opsHealth.changeOperations.oldestOverdue")}
              state={
                metrics.reminders.oldestOverdueMinutes === null
                  ? "ok"
                  : metrics.reminders.oldestOverdueMinutes > 0
                    ? "warning"
                    : "ok"
              }
              value={minutes(metrics.reminders.oldestOverdueMinutes)}
            />
            <MetricTile
              label={t("admin.opsHealth.changeOperations.delivery")}
              state={delivery !== null && delivery.deadLetter > 0 ? "warning" : "ok"}
              value={
                delivery === null
                  ? t("admin.opsHealth.changeOperations.unknown")
                  : t("admin.opsHealth.changeOperations.deliveryValue", {
                      queued: delivery.pending + delivery.processing,
                      dead: delivery.deadLetter,
                    })
              }
            />
            <MetricTile
              label={t("admin.opsHealth.changeOperations.oldestPending")}
              state={
                delivery !== null &&
                delivery.oldestPendingMinutes !== null &&
                delivery.oldestPendingMinutes > 15
                  ? "warning"
                  : "ok"
              }
              value={minutes(delivery?.oldestPendingMinutes ?? null)}
            />
            <MetricTile
              label={t("admin.opsHealth.changeOperations.drift")}
              state={driftPass === null ? "unknown" : driftPass.drifted > 0 ? "warning" : "ok"}
              value={
                driftPass === null
                  ? t("admin.opsHealth.changeOperations.unknown")
                  : t("admin.opsHealth.changeOperations.driftValue", {
                      drifted: driftPass.drifted,
                      scanned: driftPass.scanned,
                    })
              }
            />
            <MetricTile
              label={t("admin.opsHealth.changeOperations.skippedServices")}
              state={metrics.downtime.skippedServices24h > 0 ? "warning" : "ok"}
              value={t("admin.opsHealth.changeOperations.countValue", {
                count: metrics.downtime.skippedServices24h,
              })}
            />
          </dl>
          {metrics.reminders.reminderHoursBeforeStart === null ? null : (
            <p className={hintClassName}>
              {t("admin.opsHealth.changeOperations.reminderWindow", {
                hours: metrics.reminders.reminderHoursBeforeStart,
              })}
            </p>
          )}
          <p className={hintClassName}>{t("admin.opsHealth.changeOperations.skippedHint")}</p>
        </>
      )}
    </section>
  );
}
