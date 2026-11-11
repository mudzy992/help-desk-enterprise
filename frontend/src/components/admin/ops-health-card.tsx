import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, CheckCheck, RefreshCw, Send } from "lucide-react";
import { OpsSilenceDialog } from "@/components/admin/ops-silence-dialog";
import { AlertHistory, AlertItem } from "@/components/admin/ops-health-alerts";
import { ComponentGrid } from "@/components/admin/ops-health-components";
import {
  ChannelSummary,
  HttpChart,
  QueueTable,
  SchedulerTable,
} from "@/components/admin/ops-health-metrics";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { useOpsHealthOverview } from "@/lib/ops/use-ops-health-overview";
import {
  dlqGrowthTotal,
  formatOpsDuration,
  overallOpsState,
  overallStateTone,
} from "@/lib/ops/ops-health-view";
import {
  acknowledgeOpsAlert,
  acknowledgeOpsDlq,
  sendOpsTestAlert,
  unsilenceOpsAlerts,
} from "@/services/ops-health-api";

const knownTestReasons = ["no_recipients", "not_configured", "email_channel_disabled"] as const;

type KnownTestReason = (typeof knownTestReasons)[number];

/** Known skip reasons are translated by the caller; anything else is shown as the technical text. */
function knownTestReason(reason: string): KnownTestReason | null {
  return knownTestReasons.find((item) => item === reason) ?? null;
}

/**
 * "System health" on Admin → Operations. Live probes of the
 * API plus the worker's last snapshot; alarm actions are audited server-side.
 */
export function OpsHealthCard({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { overview, loadError, refreshing, nowMs, load } = useOpsHealthOverview();
  const [pending, setPending] = useState<string | null>(null);
  const [silenceOpen, setSilenceOpen] = useState(false);
  const [confirmDlq, setConfirmDlq] = useState(false);

  const run = async (id: string, work: () => Promise<unknown>, successTitle: string) => {
    setPending(id);
    try {
      await work();
      toast({ tone: "success", title: successTitle });
      await load();
    } catch (caught) {
      toast({ tone: "danger", title: t(mapApiError(caught)), error: caught });
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
        .map(
          (channel) =>
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
      toast({ tone: "danger", title: t(mapApiError(caught)), error: caught });
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
            : t("admin.opsHealth.snapshotAge", {
                age: formatOpsDuration((overview.snapshot.ageSeconds ?? 0) * 1000),
              })
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
        {loadError ? (
          <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />
        ) : null}

        {overview.silence ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-warning"
          >
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
                onClick={() =>
                  void run("unsilence", unsilenceOpsAlerts, t("admin.opsHealth.silence.cleared"))
                }
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
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending !== null}
                  onClick={() => void runTest()}
                >
                  <Send /> {t("admin.opsHealth.test.action")}
                </Button>
                {overview.silence === null ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending !== null}
                    onClick={() => setSilenceOpen(true)}
                  >
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
                    void run(
                      `ack:${alert.id}`,
                      () => acknowledgeOpsAlert(alert.id),
                      t("admin.opsHealth.alerts.acknowledged"),
                    )
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
              <Button
                size="sm"
                variant="secondary"
                disabled={pending !== null || growth === 0}
                onClick={() => setConfirmDlq(true)}
              >
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
