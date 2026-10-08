import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, Plus, RefreshCw, Wrench, XCircle } from "lucide-react";
import { IncidentCard } from "@/components/status/incident-card";
import { IncidentFormDialog, type IncidentFormMode } from "@/components/status/incident-form-dialog";
import { IncidentUpdateDialog } from "@/components/status/incident-update-dialog";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  availabilityDotClassName,
  mapStatusError,
  overallStatus,
  type OverallStatus,
} from "@/lib/status/status-view";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import {
  getStatusOverview,
  subscribeToIncident,
  unsubscribeFromIncident,
  type Incident,
  type IncidentStatus,
  type StatusPageOverview,
} from "@/services/status-api";

/** Status changes minute by minute at most; faster polling only adds load. */
const refreshEveryMs = 60_000;

type LoadError = { readonly key: ApiErrorKey; readonly requestId: string | null; readonly disabled: boolean };

const overallIcon: Record<OverallStatus, typeof CheckCircle2> = {
  operational: CheckCircle2,
  partial: AlertTriangle,
  major: XCircle,
  maintenance: Wrench,
};

const overallSurface: Record<OverallStatus, string> = {
  operational: "border-success/30 bg-success/10 text-ok",
  partial: "border-warning/30 bg-warning/10 text-warning",
  major: "border-danger/30 bg-danger/10 text-danger",
  maintenance: "border-info/30 bg-info/10 text-info",
};

/**
 * Paket 2.7 (§8): the status page for every signed-in user. Holders of
 * `status.incidents.manage` open, update and resolve incidents here.
 */
export function StatusPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [overview, setOverview] = useState<StatusPageOverview | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<IncidentFormMode | null>(null);
  const [updateTarget, setUpdateTarget] = useState<{ readonly incident: Incident; readonly status?: IncidentStatus } | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setOverview(await getStatusOverview());
      setLoadError(null);
      setNowMs(Date.now());
    } catch (caught) {
      setLoadError({
        key: mapApiError(caught),
        requestId: readApiRequestId(caught),
        disabled: mapStatusError(caught) === "status.errors.disabled",
      });
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

  const toggleSubscription = async (incident: Incident) => {
    setBusyId(incident.id);
    try {
      if (incident.subscribed) {
        await unsubscribeFromIncident(incident.id);
        toast({ tone: "info", title: t("status.card.unsubscribed") });
      } else {
        await subscribeToIncident(incident.id);
        toast({ tone: "success", title: t("status.card.subscribed") });
      }
      await load();
    } catch (caught) {
      toast({ tone: "danger", title: t(mapStatusError(caught) ?? mapApiError(caught)), error: caught });
    } finally {
      setBusyId(null);
    }
  };

  const header = (
    <PageHeader
      crumbs={[t("navigation.sections.services"), t("status.title")]}
      title={t("status.title")}
      subtitle={t("status.subtitle")}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            {t("status.refresh")}
          </Button>
          {overview?.canManage ? (
            <Button size="sm" onClick={() => setFormMode({ kind: "create" })}>
              <Plus />
              {t("status.newIncident")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (overview === null) {
    return (
      <div className="page-in">
        {header}
        {loadError === null ? (
          <PanelSkeleton label={t("status.loading")} />
        ) : loadError.disabled ? (
          <EmptyState icon={<Activity size={18} />} title={t("status.disabledTitle")} body={t("status.disabledBody")} />
        ) : (
          <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />
        )}
      </div>
    );
  }

  const state = overallStatus(overview.activeIncidents, overview.affectedServiceCount);
  const StateIcon = overallIcon[state];

  return (
    <div className="page-in grid gap-4">
      {header}

      {!overview.configuration.enabled ? (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-[12.5px] text-warning">
          {t("status.disabledForUsers")}
        </div>
      ) : null}

      <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3.5", overallSurface[state])} data-testid="status-overall">
        <StateIcon size={20} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{t(`status.overall.${state}`)}</p>
          <p className="text-[12px] text-foreground/75">
            {overview.affectedServiceCount > 0
              ? t("status.affectedServices", { count: overview.affectedServiceCount })
              : t("status.allOperational")}
          </p>
        </div>
        <span className="text-[11.5px] text-foreground/65">
          {t("status.updatedAt", { time: formatTicketTimestamp(overview.generatedAt, i18n.language) })}
        </span>
      </div>

      {overview.activeIncidents.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="status-active">
          <h2 id="status-active" className="text-[13px] font-semibold text-foreground">
            {t("status.activeIncidents")}
          </h2>
          {overview.activeIncidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              canManage={overview.canManage}
              nowMs={nowMs}
              busy={busyId === incident.id}
              onSubscribe={(item) => void toggleSubscription(item)}
              onEdit={(item) => setFormMode({ kind: "edit", incident: item })}
              onUpdate={(item) => setUpdateTarget({ incident: item })}
              onResolve={(item) => setUpdateTarget({ incident: item, status: "RESOLVED" })}
            />
          ))}
        </section>
      ) : null}

      {overview.planned.length > 0 ? (
        <Card>
          <CardHeader title={t("status.planned")} subtitle={t("status.plannedHint")} />
          <ul className="grid gap-2.5 px-4 py-3.5">
            {overview.planned.map((window) => (
              <li key={`${window.serviceId}-${window.startsAt}`} className="flex flex-wrap items-start gap-2 text-[12.5px]">
                <CalendarClock size={14} className="mt-0.5 text-info" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{window.serviceName}</p>
                  <p className={hintClassName}>
                    {formatTicketTimestamp(window.startsAt, i18n.language)} – {formatTicketTimestamp(window.endsAt, i18n.language)}
                  </p>
                  {window.message ? <p className="mt-0.5 text-foreground/85">{window.message}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={t("status.services")}
          subtitle={
            overview.configuration.showUptimePercent
              ? t("status.uptimeHint", { days: overview.configuration.historyDays })
              : undefined
          }
        />
        {overview.categories.length === 0 ? (
          <div className="px-4 py-4">
            <p className={hintClassName}>{t("status.noServices")}</p>
          </div>
        ) : (
          <div className="grid gap-4 px-4 py-3.5">
            {overview.categories.map((category) => (
              <div key={category.id ?? "none"}>
                <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category.name ?? t("status.uncategorized")}
                </h3>
                <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {category.services.map((service) => (
                    <li
                      key={service.id}
                      className="flex items-center gap-2.5 rounded-md border border-border/70 bg-background/40 px-3 py-2"
                      data-testid="status-service"
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", availabilityDotClassName(service.availability))} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground" title={service.name}>
                        {service.name}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-muted-foreground">
                        {t(`status.availability.${service.availability}`)}
                      </span>
                      {service.uptimePercent !== null ? (
                        <Badge tone="neutral" className="shrink-0">
                          {t("status.uptime", {
                            value: service.uptimePercent.toLocaleString(i18n.language, { maximumFractionDigits: 1 }),
                          })}
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <section className="grid gap-3" aria-labelledby="status-history">
        <h2 id="status-history" className="text-[13px] font-semibold text-foreground">
          {t("status.history", { days: overview.configuration.historyDays })}
        </h2>
        {overview.history.length === 0 ? (
          <p className={hintClassName}>{t("status.historyEmpty")}</p>
        ) : (
          overview.history.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} canManage={false} nowMs={nowMs} defaultExpanded={false} />
          ))
        )}
      </section>

      {formMode !== null ? (
        <IncidentFormDialog
          open
          onOpenChange={(open) => (open ? undefined : setFormMode(null))}
          mode={formMode}
          onSaved={() => void load()}
        />
      ) : null}
      {updateTarget !== null ? (
        <IncidentUpdateDialog
          open
          onOpenChange={(open) => (open ? undefined : setUpdateTarget(null))}
          incident={updateTarget.incident}
          initialStatus={updateTarget.status}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
