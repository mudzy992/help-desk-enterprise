import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { ScrollRegion } from "@/components/ui/scroll-region";
import {
  hintClassName,
  sectionTitleClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { ComponentTile } from "@/components/admin/ops-health-components";
import {
  componentStateTone,
  formatOpsDuration,
  httpBars,
  sortSchedulers,
  type ComponentState,
} from "@/lib/ops/ops-health-view";
import { scheduledJobTranslationKey } from "@/lib/ops/scheduled-job-i18n";
import type { OpsOverview } from "@/services/ops-health-api";

export function AssetOperationsSummary({ overview }: { readonly overview: OpsOverview }) {
  const { t } = useTranslation();
  const metrics = overview.assetOperations;
  return (
    <section className="grid gap-2" data-testid="ops-health-assets">
      <div>
        <h4 className={sectionTitleClassName}>{t("admin.opsHealth.assetOperations.title")}</h4>
        <p className={hintClassName}>{t("admin.opsHealth.assetOperations.hint")}</p>
      </div>
      {metrics === null ? (
        <p className={hintClassName}>{t("admin.opsHealth.assetOperations.unavailable")}</p>
      ) : (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <AssetMetric
            label={t("admin.opsHealth.assetOperations.directorySyncOverlaps")}
            value={
              metrics.directorySyncOverlapsLastHour === null
                ? t("admin.opsHealth.assetOperations.unknown")
                : t("admin.opsHealth.assetOperations.countValue", {
                    count: metrics.directorySyncOverlapsLastHour,
                  })
            }
          />
          <AssetMetric
            label={t("admin.opsHealth.assetOperations.importStuckClaims")}
            state={metrics.importStuckClaims > 0 ? "warning" : "ok"}
            value={t("admin.opsHealth.assetOperations.countValue", {
              count: metrics.importStuckClaims,
            })}
          />
          <AssetMetric
            label={t("admin.opsHealth.assetOperations.overAllocatedLicenses")}
            value={t("admin.opsHealth.assetOperations.licenseOverAllocationValue", {
              licenses: metrics.overAllocatedLicenseCount,
              seats: metrics.overAllocatedSeatCount,
            })}
          />
          <AssetMetric
            label={t("admin.opsHealth.assetOperations.reminderDelivery")}
            state={
              metrics.failedReminderDeliveries + metrics.staleReminderClaims > 0 ? "warning" : "ok"
            }
            value={t("admin.opsHealth.assetOperations.reminderDeliveryValue", {
              failed: metrics.failedReminderDeliveries,
              stale: metrics.staleReminderClaims,
            })}
          />
          <AssetMetric
            label={t("admin.opsHealth.assetOperations.transferFiles")}
            state={
              metrics.staleTransferFilePurges > 0 ||
              (metrics.transferFileScanState === "complete" &&
                ((metrics.orphanedTransferFiles ?? 0) > 0 ||
                  (metrics.missingTransferFiles ?? 0) > 0))
                ? "warning"
                : metrics.transferFileScanState === "complete"
                  ? "ok"
                  : "unknown"
            }
            value={t("admin.opsHealth.assetOperations.transferPurgeValue", {
              pending: metrics.pendingTransferFilePurges,
              stale: metrics.staleTransferFilePurges,
              oldest:
                metrics.oldestTransferFilePurgeAgeMinutes === null
                  ? t("admin.opsHealth.assetOperations.none")
                  : metrics.oldestTransferFilePurgeAgeMinutes,
            })}
          >
            {metrics.transferFileScanState === "complete"
              ? t("admin.opsHealth.assetOperations.transferScanValue", {
                  scanned: metrics.scannedTransferFiles ?? 0,
                  referenced: metrics.referencedTransferFiles ?? 0,
                  orphaned: metrics.orphanedTransferFiles ?? 0,
                  missing: metrics.missingTransferFiles ?? 0,
                })
              : t(`admin.opsHealth.assetOperations.transferScan.${metrics.transferFileScanState}`)}
          </AssetMetric>
          <AssetMetric
            label={t("admin.opsHealth.assetOperations.auditFailures")}
            state={
              metrics.auditWriteFailuresLastHour === null
                ? "unknown"
                : metrics.auditWriteFailuresLastHour >= 5
                  ? "fail"
                  : metrics.auditWriteFailuresLastHour > 0
                    ? "warning"
                    : "ok"
            }
            value={
              metrics.auditWriteFailuresLastHour === null
                ? t("admin.opsHealth.assetOperations.unknown")
                : t("admin.opsHealth.assetOperations.countValue", {
                    count: metrics.auditWriteFailuresLastHour,
                  })
            }
          />
        </dl>
      )}
    </section>
  );
}

function AssetMetric({
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
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[12.5px] font-medium text-foreground">{label}</dt>
        {state === undefined ? null : (
          <Badge tone={componentStateTone[state]} dot>
            {t(`admin.opsHealth.state.${state}`)}
          </Badge>
        )}
      </div>
      <dd className={`${hintClassName} tnum`}>{value}</dd>
      {children ? <div className={`${hintClassName} tnum`}>{children}</div> : null}
    </div>
  );
}

export function HttpChart({ overview }: { readonly overview: OpsOverview }) {
  const { t, i18n } = useTranslation();
  const { bars, max, totalErrors } = httpBars(overview.http.series);
  const requests = overview.http.series.reduce((sum, entry) => sum + entry.total, 0);
  return (
    <section className="grid gap-2">
      <div>
        <h4 className={sectionTitleClassName}>{t("admin.opsHealth.http.title")}</h4>
        <p className={hintClassName}>
          {t("admin.opsHealth.http.summary", { errors: totalErrors, requests })}
        </p>
      </div>
      {bars.length === 0 ? (
        <p className={hintClassName}>{t("admin.opsHealth.http.empty")}</p>
      ) : (
        <div
          role="img"
          aria-label={t("admin.opsHealth.http.summary", { errors: totalErrors, requests })}
          className="flex h-16 items-end gap-px rounded-md border border-border bg-surface px-1.5 pt-1.5"
        >
          {bars.map((bar) => (
            <div
              key={bar.at}
              className="flex h-full flex-1 items-end"
              title={t("admin.opsHealth.http.bar", {
                time: new Date(bar.at).toLocaleTimeString(i18n.language, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                errors: bar.errors5xx,
                total: bar.total,
              })}
            >
              <div
                className={
                  bar.errors5xx > 0
                    ? "w-full rounded-t-sm bg-danger/70"
                    : "w-full rounded-t-sm bg-border"
                }
                style={{ height: bar.errors5xx > 0 ? `${Math.max(6, bar.heightPercent)}%` : "2px" }}
              />
            </div>
          ))}
        </div>
      )}
      {bars.length > 0 ? (
        <p className={`${hintClassName} tnum`}>{t("admin.opsHealth.http.scale", { max })}</p>
      ) : null}
    </section>
  );
}

export function SchedulerTable({ overview }: { readonly overview: OpsOverview }) {
  const { t, i18n } = useTranslation();
  const schedulers = sortSchedulers(overview.schedulers);
  return (
    <section className="grid gap-2">
      <h4 className={sectionTitleClassName}>{t("admin.opsHealth.schedulers.title")}</h4>
      {schedulers.length === 0 ? (
        <p className={hintClassName}>{t("admin.opsHealth.schedulers.empty")}</p>
      ) : (
        <ScrollRegion className={tableWrapClassName}>
          <table className="w-full text-left text-[12.5px]">
            <thead className={tableHeadClassName}>
              <tr className="border-b border-border">
                <th className="px-3 py-2">{t("admin.opsHealth.schedulers.job")}</th>
                <th className="px-3 py-2">{t("admin.opsHealth.schedulers.interval")}</th>
                <th className="px-3 py-2">{t("admin.opsHealth.schedulers.lastSuccess")}</th>
                <th className="px-3 py-2">{t("admin.opsHealth.schedulers.next")}</th>
                <th className="px-3 py-2">{t("admin.opsHealth.schedulers.state")}</th>
              </tr>
            </thead>
            <tbody>
              {schedulers.map((scheduler) => {
                const nameKey = scheduledJobTranslationKey(scheduler.schedulerId);
                return (
                  <tr
                    key={`${scheduler.queue}/${scheduler.schedulerId}`}
                    className={tableRowClassName}
                  >
                    <td className="px-3">
                      <span className="font-medium text-foreground">
                        {nameKey === null ? scheduler.queue : t(nameKey)}
                      </span>
                      <code className="block text-[11.5px] text-muted-foreground">
                        {scheduler.schedulerId}
                      </code>
                      {scheduler.registered === false ? (
                        <span className="block text-[11.5px] text-warning">
                          {t("admin.opsHealth.schedulers.notRegistered")}
                        </span>
                      ) : null}
                    </td>
                    <td className="tnum px-3 text-muted-foreground">
                      {scheduler.everyMs !== null
                        ? t("admin.opsHealth.schedulers.every", {
                            interval: formatOpsDuration(scheduler.everyMs),
                          })
                        : (scheduler.pattern ?? "—")}
                    </td>
                    <td className="px-3">
                      {scheduler.lastSuccessAt === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <RelativeTime value={scheduler.lastSuccessAt} locale={i18n.language} />
                      )}
                      {scheduler.lastSuccessMaxAgeMs !== null ? (
                        <span className="block text-[11.5px] text-muted-foreground">
                          {t("admin.opsHealth.schedulers.lastSuccessGate", {
                            duration: formatOpsDuration(scheduler.lastSuccessMaxAgeMs),
                          })}
                        </span>
                      ) : null}
                      {scheduler.lastFailureAt !== null &&
                      (scheduler.lastSuccessAt === null ||
                        scheduler.lastFailureAt > scheduler.lastSuccessAt) ? (
                        <span className="block text-[11.5px] text-danger">
                          {t("admin.opsHealth.schedulers.lastFailure")}{" "}
                          <RelativeTime value={scheduler.lastFailureAt} locale={i18n.language} />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3">
                      {scheduler.nextAt === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <RelativeTime value={scheduler.nextAt} locale={i18n.language} />
                      )}
                    </td>
                    <td className="px-3">
                      <Badge tone={scheduler.state === "late" ? "warning" : "success"} dot>
                        {t(`admin.opsHealth.schedulers.states.${scheduler.state}`)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </section>
  );
}

export function QueueTable({
  overview,
}: {
  readonly overview: Pick<OpsOverview, "queues" | "dlq">;
}) {
  const { t } = useTranslation();
  const growth = overview.dlq.growth?.failedByQueue ?? {};
  if (overview.queues.length === 0)
    return <p className={hintClassName}>{t("admin.opsHealth.queues.empty")}</p>;
  return (
    <ScrollRegion className={tableWrapClassName}>
      <table className="w-full text-left text-[12.5px]">
        <thead className={tableHeadClassName}>
          <tr className="border-b border-border">
            <th className="px-3 py-2">{t("admin.opsHealth.queues.queue")}</th>
            <th className="px-3 py-2 text-right">{t("admin.opsHealth.queues.waiting")}</th>
            <th className="px-3 py-2 text-right">{t("admin.opsHealth.queues.active")}</th>
            <th className="px-3 py-2 text-right">{t("admin.opsHealth.queues.delayed")}</th>
            <th className="px-3 py-2 text-right">{t("admin.opsHealth.queues.failed")}</th>
          </tr>
        </thead>
        <tbody>
          {[...overview.queues]
            .sort((left, right) => left.queue.localeCompare(right.queue))
            .map((queue) => (
              <tr key={queue.queue} className={tableRowClassName}>
                <td className="px-3 font-medium text-foreground">{queue.queue}</td>
                <td className="tnum px-3 text-right">{queue.waiting}</td>
                <td className="tnum px-3 text-right">{queue.active}</td>
                <td className="tnum px-3 text-right">{queue.delayed}</td>
                <td
                  className={`tnum px-3 text-right ${(growth[queue.queue] ?? 0) > 0 ? "font-semibold text-danger" : ""}`}
                >
                  {queue.failed}
                  {(growth[queue.queue] ?? 0) > 0 ? ` (+${growth[queue.queue]})` : null}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export function ChannelSummary({ overview }: { readonly overview: OpsOverview }) {
  const { t } = useTranslation();
  const configuration = overview.configuration;
  const rows: ReadonlyArray<{ key: string; label: string; state: ComponentState; value: string }> =
    [
      {
        key: "recipients",
        label: t("admin.opsHealth.channelsSummary.extraRecipients"),
        state: "ok",
        value: t("admin.opsHealth.channelsSummary.extraRecipientsValue", {
          count: configuration.extraRecipientCount,
        }),
      },
      {
        key: "teams",
        label: t("admin.opsHealth.channels.teams"),
        state: configuration.teamsConfigured ? "ok" : "off",
        value: t(
          configuration.teamsConfigured
            ? "admin.opsHealth.channelsSummary.configured"
            : "admin.opsHealth.channelsSummary.notConfigured",
        ),
      },
      {
        key: "fallback",
        label: t("admin.opsHealth.channelsSummary.fallback"),
        state: configuration.fallbackConfigured ? "ok" : "warning",
        value: t(
          configuration.fallbackConfigured
            ? "admin.opsHealth.channelsSummary.configured"
            : "admin.opsHealth.channelsSummary.fallbackMissing",
        ),
      },
      {
        key: "uptime",
        label: t("admin.opsHealth.channelsSummary.uptime"),
        state: configuration.uptimePushConfigured ? "ok" : "off",
        value: t(
          configuration.uptimePushConfigured
            ? "admin.opsHealth.channelsSummary.configured"
            : "admin.opsHealth.channelsSummary.notConfigured",
        ),
      },
    ];
  return (
    <section className="grid gap-2">
      <div>
        <h4 className={sectionTitleClassName}>{t("admin.opsHealth.channelsSummary.title")}</h4>
        <p className={hintClassName}>
          {t("admin.opsHealth.channelsSummary.hint", { hours: configuration.reminderHours })}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <ComponentTile key={row.key} label={row.label} state={row.state}>
            {row.value}
          </ComponentTile>
        ))}
      </div>
    </section>
  );
}
