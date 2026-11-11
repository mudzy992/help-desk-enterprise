import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { formatBytes } from "@/lib/privacy/privacy-view";
import {
  clamavState,
  componentStateTone,
  diskState,
  eventLoopState,
  formatOpsDuration,
  inboundState,
  ldapsCaState,
  type ComponentState,
} from "@/lib/ops/ops-health-view";
import type { OpsOverview } from "@/services/ops-health-api";

export function ComponentTile({
  label,
  state,
  children,
}: {
  readonly label: string;
  readonly state: ComponentState;
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1 rounded-md border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-foreground">{label}</span>
        <Badge tone={componentStateTone[state]} dot>
          {t(`admin.opsHealth.state.${state}`)}
        </Badge>
      </div>
      {children ? <div className={`${hintClassName} tnum`}>{children}</div> : null}
    </div>
  );
}

export function ComponentGrid({
  overview,
  nowMs,
}: {
  readonly overview: OpsOverview;
  readonly nowMs: number;
}) {
  const { t, i18n } = useTranslation();
  const { components, configuration } = overview;
  const worker = components.worker;
  const workerState: ComponentState =
    worker.status === "active" ? "ok" : worker.status === "stale" ? "fail" : "unknown";
  const disk = components.disk;
  const ldaps = ldapsCaState(components.ldapsCaExpiresAt, nowMs);
  const clamav = components.clamav;
  return (
    <section className="grid gap-2">
      <h4 className={sectionTitleClassName}>{t("admin.opsHealth.components.title")}</h4>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ComponentTile
          label={t("admin.opsHealth.components.api")}
          state={
            components.api !== "ok"
              ? "fail"
              : eventLoopState(components.eventLoopLagMs) === "unknown"
                ? "ok"
                : eventLoopState(components.eventLoopLagMs)
          }
        >
          {components.eventLoopLagMs === null
            ? null
            : t("admin.opsHealth.components.eventLoop", {
                ms: Math.round(components.eventLoopLagMs),
              })}
        </ComponentTile>
        <ComponentTile
          label={t("admin.opsHealth.components.database")}
          state={components.database === "ok" ? "ok" : "fail"}
        />
        <ComponentTile
          label={t("admin.opsHealth.components.redis")}
          state={components.redis === "ok" ? "ok" : "fail"}
        />
        <ComponentTile label={t("admin.opsHealth.components.worker")} state={workerState}>
          {worker.heartbeatAgeSeconds === null
            ? t("admin.opsHealth.components.noHeartbeat")
            : t("admin.opsHealth.components.heartbeat", {
                age: formatOpsDuration(worker.heartbeatAgeSeconds * 1000),
              })}
        </ComponentTile>
        <ComponentTile
          label={t("admin.opsHealth.components.disk")}
          state={diskState(disk, configuration.thresholds)}
        >
          {disk === null
            ? t("admin.opsHealth.components.unknown")
            : t("admin.opsHealth.components.diskUsage", {
                percent: Math.round(disk.usedPercent),
                free: formatBytes(disk.freeBytes, i18n.language),
                total: formatBytes(disk.totalBytes, i18n.language),
              })}
        </ComponentTile>
        <ComponentTile label={t("admin.opsHealth.components.clamav")} state={clamavState(clamav)}>
          {clamav !== null && clamav.configured && !clamav.ok
            ? t(
                clamav.failOpen
                  ? "admin.opsHealth.components.clamavFailOpen"
                  : "admin.opsHealth.components.clamavBlocking",
              )
            : clamav !== null && !clamav.configured
              ? t("admin.opsHealth.components.notConfigured")
              : null}
        </ComponentTile>
        <ComponentTile
          label={t("admin.opsHealth.components.email")}
          state={
            (components.email.stuckClaims ?? 0) > 0
              ? "warning"
              : components.email.lastSentAt === null
                ? "unknown"
                : "ok"
          }
        >
          {(components.email.stuckClaims ?? 0) > 0 ? (
            t("admin.opsHealth.components.stuckEmailClaims", {
              count: components.email.stuckClaims ?? 0,
            })
          ) : components.email.lastSentAt === null ? (
            t("admin.opsHealth.components.noEmailYet")
          ) : (
            <>
              {t("admin.opsHealth.components.lastSent")}{" "}
              <RelativeTime value={components.email.lastSentAt} locale={i18n.language} />
            </>
          )}
        </ComponentTile>
        <ComponentTile label={t("admin.opsHealth.components.ldapsCa")} state={ldaps.state}>
          {ldaps.daysLeft === null
            ? t("admin.opsHealth.components.notConfigured")
            : t("admin.opsHealth.components.daysLeft", { count: ldaps.daysLeft })}
        </ComponentTile>
        {components.inbound.map((mailbox) => (
          <ComponentTile
            key={mailbox.mailboxKey}
            label={t("admin.opsHealth.components.inbound", { mailbox: mailbox.mailboxKey })}
            state={inboundState(mailbox)}
          >
            {mailbox.lastSuccessAt === null ? (
              t("admin.opsHealth.components.neverRead")
            ) : (
              <>
                {t("admin.opsHealth.components.lastRead")}{" "}
                <RelativeTime value={mailbox.lastSuccessAt} locale={i18n.language} />
                {mailbox.consecutiveFails > 0
                  ? ` · ${t("admin.opsHealth.components.fails", { count: mailbox.consecutiveFails })}`
                  : null}
              </>
            )}
            {mailbox.consecutiveFails > 0 && mailbox.lastError ? (
              <span className="mt-0.5 block break-words text-danger" title={mailbox.lastError}>
                {t("admin.opsHealth.components.lastError", {
                  error: mailbox.lastError.slice(0, 160),
                })}
              </span>
            ) : null}
          </ComponentTile>
        ))}
      </div>
    </section>
  );
}
