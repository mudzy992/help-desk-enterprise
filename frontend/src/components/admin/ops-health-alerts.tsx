import { useEffect, useState } from "react";
import {
  BellRing,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Send,
  ServerCrash,
  MailWarning,
  Timer,
  Clock,
  HardDrive,
  ShieldAlert,
  Layers,
  Wifi,
  Database,
  KeyRound,
  WifiOff,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ScrollRegion } from "@/components/ui/scroll-region";
import {
  hintClassName,
  sectionTitleClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import {
  alertDetailEntries,
  alertDetailLabelKey,
  sortAlertDetailEntries,
  alertDurationMs,
  formatOpsDuration,
  opsAlertSlug,
  severityTone,
  type OpsAlertSlug,
} from "@/lib/ops/ops-health-view";
import { listOpsAlertHistory, type OpsAlert } from "@/services/ops-health-api";

/** Stable visual mapping for known alert families; unknown alerts use the shield fallback. */
const alertIcons: Record<OpsAlertSlug, LucideIcon> = {
  worker_down: ServerCrash,
  email_providerBlocked: MailWarning,
  sla_scan_late: Timer,
  scheduler_late: Clock,
  disk_usage: HardDrive,
  clamav_unavailable: ShieldAlert,
  queue_dlq: Layers,
  http_5xx: Wifi,
  database_unavailable: Database,
  redis_unavailable: Database,
  api_eventloop_lag: RefreshCw,
  tls_ldapsCa_expiry: KeyRound,
  ops_monitor_stale: WifiOff,
  ops_test: Send,
  websocket_emits_high: Wifi,
  auth_login429_high: ShieldAlert,
  auth_captchaFailed_high: ShieldAlert,
  auth_captchaSkipped_high: ShieldAlert,
  security_auditWebhook_stalled: Webhook,
};

function AlertTitle({ alertKey }: { readonly alertKey: string }) {
  const { t } = useTranslation();
  const slug = opsAlertSlug(alertKey);
  return <>{slug === null ? alertKey : t(`admin.opsHealth.alertKeys.${slug}.title`)}</>;
}

export function AlertItem({
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
  const Icon = slug === null ? ShieldAlert : alertIcons[slug];
  const details = sortAlertDetailEntries(alertDetailEntries(alert.details));
  const detailLabel = (label: string) => {
    const [head, ...rest] = label.split(".");
    const key = alertDetailLabelKey(head ?? label);
    const translated = key === null ? (head ?? label) : t(key);
    return [translated, ...rest].join(" · ");
  };
  return (
    <li
      className={cn(
        "grid gap-1.5 rounded-md border border-border border-l-2 bg-surface px-3 py-2.5",
        alert.severity === "CRITICAL" ? "border-l-danger/70" : "border-l-warning/70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                alert.severity === "CRITICAL"
                  ? "bg-danger/10 text-danger"
                  : "bg-warning/10 text-warning",
              )}
              aria-hidden="true"
            >
              <Icon size={13.5} strokeWidth={2} />
            </span>
            <Badge tone={severityTone(alert)} dot>
              {t(`admin.opsHealth.severity.${alert.severity}`)}
            </Badge>
            <span className="text-[13px] font-medium text-foreground">
              <AlertTitle alertKey={alert.key} />
            </span>
          </div>
          <span className={`${hintClassName} tnum`}>
            {t("admin.opsHealth.alerts.activeFor", {
              duration: formatOpsDuration(alertDurationMs(alert, nowMs)),
            })}
            {" · "}
            {t("admin.opsHealth.alerts.notified", { count: alert.notifyCount })}
          </span>
        </div>
        {alert.status === "ACKNOWLEDGED" ? (
          <Badge tone="info">
            {t("admin.opsHealth.alerts.acknowledgedBy", {
              name: alert.acknowledgedBy ?? "—",
              at:
                alert.acknowledgedAt === null
                  ? ""
                  : new Date(alert.acknowledgedAt).toLocaleString(i18n.language),
            })}
          </Badge>
        ) : (
          <Button size="xs" variant="secondary" disabled={busy} onClick={onAcknowledge}>
            <BellRing /> {t("admin.opsHealth.alerts.acknowledge")}
          </Button>
        )}
      </div>
      {slug !== null ? (
        <p className="text-[12.5px] text-foreground">
          {t(`admin.opsHealth.alertKeys.${slug}.action`)}
        </p>
      ) : null}
      {details.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-muted-foreground">
          {details.map(([label, value]) => (
            <div key={label} className="flex gap-1">
              <dt>{detailLabel(label)}:</dt>
              <dd className="tnum font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {alert.runbook ? (
        <p className={hintClassName}>
          {t("admin.opsHealth.alerts.runbook")}{" "}
          <code className="text-[11.5px]">{alert.runbook}</code>
        </p>
      ) : null}
    </li>
  );
}

export function AlertHistory({
  nowMs,
  historyDays,
}: {
  readonly nowMs: number;
  readonly historyDays: number;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly OpsAlert[] | null>(null);
  const [error, setError] = useState<ApiErrorKey | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    listOpsAlertHistory(100)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(mapApiError(caught));
      });
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
        <span className={sectionTitleClassName}>
          {t("admin.opsHealth.history.title", { days: historyDays })}
        </span>
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
                    <td className="tnum px-3">
                      {new Date(alert.firstSeenAt).toLocaleString(i18n.language)}
                    </td>
                    <td className="tnum px-3">
                      {formatOpsDuration(alertDurationMs(alert, nowMs))}
                    </td>
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
