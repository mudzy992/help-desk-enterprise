import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { componentStateTone, type ComponentState } from "@/lib/ops/ops-health-view";
import type { OpsOverview } from "@/services/ops-health-api";

/**
 * W7.42 (BA-problems-21): the problem-operations section lives in its own file.
 * It grew past the component size budget when the notice outbox metrics were
 * added, and the asset section reuses the same tile.
 */
export function MetricTile({
  label,
  value,
  state,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly state?: ComponentState;
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid content-start gap-1 rounded-md border border-border bg-surface px-3 py-2.5">
      <dt className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-foreground">
        <span className="min-w-0">{label}</span>
        {state === undefined ? null : (
          <Badge tone={componentStateTone[state]} dot>
            {t(`admin.opsHealth.state.${state}`)}
          </Badge>
        )}
      </dt>
      <dd className={`${hintClassName} tnum`}>{value}</dd>
      {children ? <dd className={`${hintClassName} tnum`}>{children}</dd> : null}
    </div>
  );
}

export function ProblemOperationsSummary({ overview }: { readonly overview: OpsOverview }) {
  const { t } = useTranslation();
  const metrics = overview.problemOperations ?? null;
  // W7.42 (BA-problems-21): the notice outbox is optional, so an older API
  // simply renders the section without those three tiles.
  const noticeOutbox = metrics?.noticeOutbox ?? null;
  const minutes = (value: number | null) =>
    value === null
      ? t("admin.opsHealth.problemOperations.unknown")
      : t("admin.opsHealth.problemOperations.minutesValue", { minutes: value });
  return (
    <section className="grid gap-2" data-testid="ops-health-problems">
      <div>
        <h4 className={sectionTitleClassName}>{t("admin.opsHealth.problemOperations.title")}</h4>
        <p className={hintClassName}>{t("admin.opsHealth.problemOperations.hint")}</p>
      </div>
      {metrics === null ? (
        <p className={hintClassName}>{t("admin.opsHealth.problemOperations.unavailable")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile
              label={t("admin.opsHealth.problemOperations.stuckReminders")}
              state={metrics.stuckReminderDeliveries > 0 ? "warning" : "ok"}
              value={t("admin.opsHealth.problemOperations.stuckRemindersValue", {
                count: metrics.stuckReminderDeliveries,
                dead: metrics.deadReminderDeliveries,
              })}
            />
            <MetricTile
              label={t("admin.opsHealth.problemOperations.oldestStuckReminder")}
              state={metrics.stuckReminderDeliveries === 0 ? "ok" : "warning"}
              value={minutes(metrics.oldestStuckReminderMinutes)}
            />
            <MetricTile
              label={t("admin.opsHealth.problemOperations.overdueTargets")}
              state={metrics.breachedOpenTargets > 0 ? "warning" : "ok"}
              value={t("admin.opsHealth.problemOperations.countValue", {
                count: metrics.breachedOpenTargets,
              })}
            />
            <MetricTile
              label={t("admin.opsHealth.problemOperations.oldestOverdueTarget")}
              state={
                metrics.oldestOverdueTargetMinutes === null
                  ? "unknown"
                  : metrics.oldestOverdueTargetMinutes > 0
                    ? "warning"
                    : "ok"
              }
              value={minutes(metrics.oldestOverdueTargetMinutes)}
            />
            <MetricTile
              label={t("admin.opsHealth.problemOperations.autoCloseDue")}
              state={
                metrics.autoCloseDue === null
                  ? "unknown"
                  : metrics.autoCloseDue > 0
                    ? "warning"
                    : "ok"
              }
              value={
                metrics.autoCloseDue === null
                  ? t("admin.opsHealth.problemOperations.unknown")
                  : t("admin.opsHealth.problemOperations.countValue", {
                      count: metrics.autoCloseDue,
                    })
              }
            />
            <MetricTile
              label={t("admin.opsHealth.problemOperations.oldestAutoCloseDue")}
              state={
                metrics.oldestAutoCloseDueMinutes === null
                  ? "unknown"
                  : metrics.oldestAutoCloseDueMinutes > 0
                    ? "warning"
                    : "ok"
              }
              value={minutes(metrics.oldestAutoCloseDueMinutes)}
            />
            {noticeOutbox === null ? null : (
              <>
                <MetricTile
                  label={t("admin.opsHealth.problemOperations.noticesQueued")}
                  state={noticeOutbox.deadLetter > 0 ? "warning" : "ok"}
                  value={t("admin.opsHealth.problemOperations.noticesQueuedValue", {
                    queued: noticeOutbox.pending + noticeOutbox.processing,
                    dead: noticeOutbox.deadLetter,
                  })}
                />
                <MetricTile
                  label={t("admin.opsHealth.problemOperations.oldestQueuedNotice")}
                  state={
                    noticeOutbox.oldestPendingMinutes !== null &&
                    noticeOutbox.oldestPendingMinutes > 5
                      ? "warning"
                      : "ok"
                  }
                  value={minutes(noticeOutbox.oldestPendingMinutes)}
                />
              </>
            )}
          </dl>
          {noticeOutbox === null ? null : (
            <p className={hintClassName}>{t("admin.opsHealth.problemOperations.noticesHint")}</p>
          )}
          {metrics.effectiveAutoCloseDays === null ? null : (
            <p className={hintClassName}>
              {t("admin.opsHealth.problemOperations.autoCloseWindow", {
                days: metrics.effectiveAutoCloseDays,
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
