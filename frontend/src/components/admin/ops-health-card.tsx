import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, BellRing, CheckCheck, ChevronDown, ChevronRight, RefreshCw, Send } from "lucide-react";
import { OpsSilenceDialog } from "@/components/admin/ops-silence-dialog";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { hintClassName, sectionTitleClassName, tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  alertDetailEntries,
  alertDurationMs,
  clamavState,
  componentStateTone,
  diskState,
  dlqGrowthTotal,
  eventLoopState,
  formatOpsDuration,
  httpBars,
  inboundState,
  ldapsCaState,
  opsAlertSlug,
  overallOpsState,
  overallStateTone,
  severityTone,
  sortSchedulers,
  type ComponentState,
} from "@/lib/ops/ops-health-view";
import { formatBytes } from "@/lib/privacy/privacy-view";
import {
  acknowledgeOpsAlert,
  acknowledgeOpsDlq,
  getOpsOverview,
  listOpsAlertHistory,
  sendOpsTestAlert,
  unsilenceOpsAlerts,
  type OpsAlert,
  type OpsOverview,
} from "@/services/ops-health-api";
import { ScrollRegion } from "@/components/ui/scroll-region";

const knownTestReasons = ["no_recipients", "not_configured", "email_channel_disabled"] as const;

type KnownTestReason = (typeof knownTestReasons)[number];

/** Known skip reasons are translated by the caller; anything else is shown as the technical text. */
function knownTestReason(reason: string): KnownTestReason | null {
  return knownTestReasons.find((item) => item === reason) ?? null;
}

/** The worker measures once a minute; refreshing faster only adds load. */
const refreshEveryMs = 30_000;

type LoadError = { readonly key: ApiErrorKey; readonly requestId: string | null };

/**
 * Paket 2.7 (§6): "System health" on Admin → Operations. Live probes of the
 * API plus the worker's last snapshot; alarm actions are audited server-side.
 */
export function OpsHealthCard({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [silenceOpen, setSilenceOpen] = useState(false);
  const [confirmDlq, setConfirmDlq] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setOverview(await getOpsOverview());
      setLoadError(null);
      setNowMs(Date.now());
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, refreshEveryMs);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (id: string, work: () => Promise<unknown>, successTitle: string) => {
    setPending(id);
    try {
      await work();
      toast({ tone: "success", title: successTitle });
      await load();
    } catch (caught) {
      toast({ tone: "danger", title: t(mapApiError(caught)) });
    } finally {
      setPending(null);
    }
  };

  const reasonLabel = (reason: string): string => {
    const known = knownTestReason(reason);
    return known === null ? reason : t(`admin.opsHealth.test.reasons.${known}`);
  };

  const runTest = async () => {
    setPending("test");
    try {
      const { channels } = await sendOpsTestAlert();
      const summary = channels
        .map((channel) =>
          t("admin.opsHealth.test.channel", {
            channel: t(`admin.opsHealth.channels.${channel.channel}`),
            status: t(`admin.opsHealth.test.status.${channel.status}`),
            delivered: channel.delivered,
          }) + (channel.reason ? ` – ${reasonLabel(channel.reason)}` : ""),
        )
        .join(" · ");
      const anyDelivered = channels.some((channel) => channel.delivered > 0);
      toast({
        tone: anyDelivered ? "success" : "warning",
        title: t(anyDelivered ? "admin.opsHealth.test.sent" : "admin.opsHealth.test.nothingSent"),
        description: summary,
        duration: 10_000,
      });
    } catch (caught) {
      toast({ tone: "danger", title: t(mapApiError(caught)) });
    } finally {
      setPending(null);
    }
  };

  if (overview === null) {
    return (
      <Card className="fade-in">
        <CardHeader title={t("admin.opsHealth.title")} subtitle={t("admin.opsHealth.subtitle")} />
        <div className="px-4 py-3.5">
          {loadError ? (
            <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />
          ) : (
            <PanelSkeleton label={t("admin.opsHealth.loading")} />
          )}
        </div>
      </Card>
    );
  }

  const state = overallOpsState(overview);
  const growth = dlqGrowthTotal(overview.dlq);

  return (
    <Card className="fade-in" data-testid="ops-health-card">
      <CardHeader
        title={t("admin.opsHealth.title")}
        subtitle={
          overview.snapshot === null
            ? t("admin.opsHealth.noSnapshot")
            : t("admin.opsHealth.snapshotAge", { age: formatOpsDuration((overview.snapshot.ageSeconds ?? 0) * 1000) })
        }
        actions={
          <>
            <Badge tone={overallStateTone[state]} dot>
              {t(`admin.opsHealth.overall.${state}`)}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              disabled={refreshing}
              aria-label={t("admin.opsHealth.refresh")}
              title={t("admin.opsHealth.refresh")}
              onClick={() => void load()}
            >
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            </Button>
          </>
        }
      />
      <div className="grid gap-5 px-4 py-3.5">
        {loadError ? <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} /> : null}

        {overview.silence ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
            <span className="flex items-center gap-1.5">
              <BellOff size={14} />
              {t("admin.opsHealth.silence.active", {
                until: new Date(overview.silence.until).toLocaleString(i18n.language),
                by: overview.silence.by ?? "—",
                reason: overview.silence.reason,
              })}
            </span>
            {canManage ? (
              <Button
                size="xs"
                variant="secondary"
                disabled={pending !== null}
                onClick={() => void run("unsilence", unsilenceOpsAlerts, t("admin.opsHealth.silence.cleared"))}
              >
                {t("admin.opsHealth.silence.clear")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!overview.configuration.alertsEnabled ? (
          <p role="status" className={`${hintClassName} rounded-md border border-border px-3 py-2`}>
            {t("admin.opsHealth.alertsDisabled")}
          </p>
        ) : null}

        <ComponentGrid overview={overview} nowMs={nowMs} />

        <section className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className={sectionTitleClassName}>{t("admin.opsHealth.alerts.title")}</h4>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={pending !== null} onClick={() => void runTest()}>
                  <Send /> {t("admin.opsHealth.test.action")}
                </Button>
                {overview.silence === null ? (
                  <Button size="sm" variant="secondary" disabled={pending !== null} onClick={() => setSilenceOpen(true)}>
                    <BellOff /> {t("admin.opsHealth.silence.action")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {overview.alerts.length === 0 ? (
            <EmptyState
              icon={<CheckCheck size={18} strokeWidth={1.8} />}
              title={t("admin.opsHealth.alerts.emptyTitle")}
              body={t("admin.opsHealth.alerts.emptyBody")}
            />
          ) : (
            <ul className="grid gap-2">
              {overview.alerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  nowMs={nowMs}
                  busy={pending !== null}
                  onAcknowledge={() =>
                    void run(`ack:${alert.id}`, () => acknowledgeOpsAlert(alert.id), t("admin.opsHealth.alerts.acknowledged"))
                  }
                />
              ))}
            </ul>
          )}
        </section>

        <HttpChart overview={overview} />

        <SchedulerTable overview={overview} />

        <section className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className={sectionTitleClassName}>{t("admin.opsHealth.queues.title")}</h4>
              <p className={hintClassName}>
                {t("admin.opsHealth.queues.dlq", {
                  count: overview.dlq.integrationDlq ?? 0,
                  growth,
                })}
              </p>
            </div>
            {canManage ? (
              <Button size="sm" variant="secondary" disabled={pending !== null || growth === 0} onClick={() => setConfirmDlq(true)}>
                <CheckCheck /> {t("admin.opsHealth.queues.acknowledge")}
              </Button>
            ) : null}
          </div>
          <QueueTable overview={overview} />
        </section>

        <ChannelSummary overview={overview} />

        <AlertHistory nowMs={nowMs} historyDays={overview.configuration.historyDays} />
      </div>

      <OpsSilenceDialog
        open={silenceOpen}
        onOpenChange={setSilenceOpen}
        onSilenced={() => {
          toast({ tone: "success", title: t("admin.opsHealth.silence.done") });
          void load();
        }}
      />
      <ConfirmDialog
        open={confirmDlq}
        onOpenChange={setConfirmDlq}
        title={t("admin.opsHealth.queues.confirmTitle")}
        description={t("admin.opsHealth.queues.confirmBody", { growth })}
        confirmLabel={t("admin.opsHealth.queues.acknowledge")}
        isPending={pending === "dlq"}
        onConfirm={() => {
          setConfirmDlq(false);
          void run("dlq", acknowledgeOpsDlq, t("admin.opsHealth.queues.acknowledged"));
        }}
      />
    </Card>
  );
}

function ComponentTile({ label, state, children }: { readonly label: string; readonly state: ComponentState; readonly children?: ReactNode }) {
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

function ComponentGrid({ overview, nowMs }: { readonly overview: OpsOverview; readonly nowMs: number }) {
  const { t, i18n } = useTranslation();
  const { components, configuration } = overview;
  const worker = components.worker;
  const workerState: ComponentState = worker.status === "active" ? "ok" : worker.status === "stale" ? "fail" : "unknown";
  const disk = components.disk;
  const ldaps = ldapsCaState(components.ldapsCaExpiresAt, nowMs);
  const clamav = components.clamav;
  return (
    <section className="grid gap-2">
      <h4 className={sectionTitleClassName}>{t("admin.opsHealth.components.title")}</h4>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ComponentTile
          label={t("admin.opsHealth.components.api")}
          state={components.api !== "ok" ? "fail" : eventLoopState(components.eventLoopLagMs) === "unknown" ? "ok" : eventLoopState(components.eventLoopLagMs)}
        >
          {components.eventLoopLagMs === null
            ? null
            : t("admin.opsHealth.components.eventLoop", { ms: Math.round(components.eventLoopLagMs) })}
        </ComponentTile>
        <ComponentTile label={t("admin.opsHealth.components.database")} state={components.database === "ok" ? "ok" : "fail"} />
        <ComponentTile label={t("admin.opsHealth.components.redis")} state={components.redis === "ok" ? "ok" : "fail"} />
        <ComponentTile label={t("admin.opsHealth.components.worker")} state={workerState}>
          {worker.heartbeatAgeSeconds === null
            ? t("admin.opsHealth.components.noHeartbeat")
            : t("admin.opsHealth.components.heartbeat", { age: formatOpsDuration(worker.heartbeatAgeSeconds * 1000) })}
        </ComponentTile>
        <ComponentTile label={t("admin.opsHealth.components.disk")} state={diskState(disk, configuration.thresholds)}>
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
            ? t(clamav.failOpen ? "admin.opsHealth.components.clamavFailOpen" : "admin.opsHealth.components.clamavBlocking")
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
                {t("admin.opsHealth.components.lastError", { error: mailbox.lastError.slice(0, 160) })}
              </span>
            ) : null}
          </ComponentTile>
        ))}
      </div>
    </section>
  );
}

function AlertTitle({ alertKey }: { readonly alertKey: string }) {
  const { t } = useTranslation();
  const slug = opsAlertSlug(alertKey);
  return <>{slug === null ? alertKey : t(`admin.opsHealth.alertKeys.${slug}.title`)}</>;
}

function AlertItem({
  alert,
  nowMs,
  busy,
  onAcknowledge,
}: {
  readonly alert: OpsAlert;
  readonly nowMs: number;
  readonly busy: boolean;
  readonly onAcknowledge: () => void;
}) {
  const { t, i18n } = useTranslation();
  const slug = opsAlertSlug(alert.key);
  const details = alertDetailEntries(alert.details);
  return (
    <li className="grid gap-1.5 rounded-md border border-border bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(alert)} dot>
              {t(`admin.opsHealth.severity.${alert.severity}`)}
            </Badge>
            <span className="text-[13px] font-medium text-foreground">
              <AlertTitle alertKey={alert.key} />
            </span>
          </div>
          <span className={`${hintClassName} tnum`}>
            {t("admin.opsHealth.alerts.activeFor", { duration: formatOpsDuration(alertDurationMs(alert, nowMs)) })}
            {" · "}
            {t("admin.opsHealth.alerts.notified", { count: alert.notifyCount })}
          </span>
        </div>
        {alert.status === "ACKNOWLEDGED" ? (
          <Badge tone="info">
            {t("admin.opsHealth.alerts.acknowledgedBy", {
              name: alert.acknowledgedBy ?? "—",
              at: alert.acknowledgedAt === null ? "" : new Date(alert.acknowledgedAt).toLocaleString(i18n.language),
            })}
          </Badge>
        ) : (
          <Button size="xs" variant="secondary" disabled={busy} onClick={onAcknowledge}>
            <BellRing /> {t("admin.opsHealth.alerts.acknowledge")}
          </Button>
        )}
      </div>
      {slug !== null ? <p className="text-[12.5px] text-foreground">{t(`admin.opsHealth.alertKeys.${slug}.action`)}</p> : null}
      {details.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-muted-foreground">
          {details.map(([label, value]) => (
            <div key={label} className="flex gap-1">
              <dt>{label}:</dt>
              <dd className="tnum text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {alert.runbook ? (
        <p className={hintClassName}>
          {t("admin.opsHealth.alerts.runbook")} <code className="text-[11.5px]">{alert.runbook}</code>
        </p>
      ) : null}
    </li>
  );
}

function HttpChart({ overview }: { readonly overview: OpsOverview }) {
  const { t, i18n } = useTranslation();
  const { bars, max, totalErrors } = httpBars(overview.http.series);
  const requests = overview.http.series.reduce((sum, entry) => sum + entry.total, 0);
  return (
    <section className="grid gap-2">
      <div>
        <h4 className={sectionTitleClassName}>{t("admin.opsHealth.http.title")}</h4>
        <p className={hintClassName}>{t("admin.opsHealth.http.summary", { errors: totalErrors, requests })}</p>
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
                time: new Date(bar.at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }),
                errors: bar.errors5xx,
                total: bar.total,
              })}
            >
              <div
                className={bar.errors5xx > 0 ? "w-full rounded-t-sm bg-danger/70" : "w-full rounded-t-sm bg-border"}
                style={{ height: bar.errors5xx > 0 ? `${Math.max(6, bar.heightPercent)}%` : "2px" }}
              />
            </div>
          ))}
        </div>
      )}
      {bars.length > 0 ? <p className={`${hintClassName} tnum`}>{t("admin.opsHealth.http.scale", { max })}</p> : null}
    </section>
  );
}

function SchedulerTable({ overview }: { readonly overview: OpsOverview }) {
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
              {schedulers.map((scheduler) => (
                <tr key={`${scheduler.queue}/${scheduler.schedulerId}`} className={tableRowClassName}>
                  <td className="px-3">
                    <span className="font-medium text-foreground">{scheduler.queue}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{scheduler.schedulerId}</span>
                  </td>
                  <td className="tnum px-3 text-muted-foreground">
                    {scheduler.everyMs !== null
                      ? t("admin.opsHealth.schedulers.every", { interval: formatOpsDuration(scheduler.everyMs) })
                      : (scheduler.pattern ?? "—")}
                  </td>
                  <td className="px-3">
                    {scheduler.lastSuccessAt === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <RelativeTime value={scheduler.lastSuccessAt} locale={i18n.language} />
                    )}
                    {scheduler.lastFailureAt !== null &&
                    (scheduler.lastSuccessAt === null || scheduler.lastFailureAt > scheduler.lastSuccessAt) ? (
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
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </section>
  );
}

function QueueTable({ overview }: { readonly overview: OpsOverview }) {
  const { t } = useTranslation();
  const growth = overview.dlq.growth?.failedByQueue ?? {};
  if (overview.queues.length === 0) return <p className={hintClassName}>{t("admin.opsHealth.queues.empty")}</p>;
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
                <td className={`tnum px-3 text-right ${(growth[queue.queue] ?? 0) > 0 ? "font-semibold text-danger" : ""}`}>
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

function ChannelSummary({ overview }: { readonly overview: OpsOverview }) {
  const { t } = useTranslation();
  const configuration = overview.configuration;
  const rows: ReadonlyArray<{ key: string; label: string; state: ComponentState; value: string }> = [
    {
      key: "recipients",
      label: t("admin.opsHealth.channelsSummary.extraRecipients"),
      state: "ok",
      value: t("admin.opsHealth.channelsSummary.extraRecipientsValue", { count: configuration.extraRecipientCount }),
    },
    {
      key: "teams",
      label: t("admin.opsHealth.channels.teams"),
      state: configuration.teamsConfigured ? "ok" : "off",
      value: t(configuration.teamsConfigured ? "admin.opsHealth.channelsSummary.configured" : "admin.opsHealth.channelsSummary.notConfigured"),
    },
    {
      key: "fallback",
      label: t("admin.opsHealth.channelsSummary.fallback"),
      state: configuration.fallbackConfigured ? "ok" : "warning",
      value: t(configuration.fallbackConfigured ? "admin.opsHealth.channelsSummary.configured" : "admin.opsHealth.channelsSummary.fallbackMissing"),
    },
    {
      key: "uptime",
      label: t("admin.opsHealth.channelsSummary.uptime"),
      state: configuration.uptimePushConfigured ? "ok" : "off",
      value: t(configuration.uptimePushConfigured ? "admin.opsHealth.channelsSummary.configured" : "admin.opsHealth.channelsSummary.notConfigured"),
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

function AlertHistory({ nowMs, historyDays }: { readonly nowMs: number; readonly historyDays: number }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly OpsAlert[] | null>(null);
  const [error, setError] = useState<ApiErrorKey | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    listOpsAlertHistory(100)
      .then((rows) => !cancelled && setItems(rows))
      .catch((caught: unknown) => !cancelled && setError(mapApiError(caught)));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <section className="grid gap-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={sectionTitleClassName}>{t("admin.opsHealth.history.title", { days: historyDays })}</span>
      </button>
      {open ? (
        error ? (
          <ApiErrorText messageKey={error} />
        ) : items === null ? (
          <PanelSkeleton label={t("admin.opsHealth.loading")} />
        ) : items.length === 0 ? (
          <p className={hintClassName}>{t("admin.opsHealth.history.empty")}</p>
        ) : (
          <ScrollRegion className={tableWrapClassName}>
            <table className="w-full text-left text-[12.5px]">
              <thead className={tableHeadClassName}>
                <tr className="border-b border-border">
                  <th className="px-3 py-2">{t("admin.opsHealth.history.alert")}</th>
                  <th className="px-3 py-2">{t("admin.opsHealth.history.severity")}</th>
                  <th className="px-3 py-2">{t("admin.opsHealth.history.started")}</th>
                  <th className="px-3 py-2">{t("admin.opsHealth.history.duration")}</th>
                  <th className="px-3 py-2">{t("admin.opsHealth.history.acknowledgedBy")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((alert) => (
                  <tr key={alert.id} className={tableRowClassName}>
                    <td className="px-3 font-medium text-foreground">
                      <AlertTitle alertKey={alert.key} />
                    </td>
                    <td className="px-3">
                      <Badge tone={alert.severity === "CRITICAL" ? "danger" : "warning"}>
                        {t(`admin.opsHealth.severity.${alert.severity}`)}
                      </Badge>
                    </td>
                    <td className="tnum px-3">{new Date(alert.firstSeenAt).toLocaleString(i18n.language)}</td>
                    <td className="tnum px-3">{formatOpsDuration(alertDurationMs(alert, nowMs))}</td>
                    <td className="px-3 text-muted-foreground">{alert.acknowledgedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )
      ) : null}
    </section>
  );
}
