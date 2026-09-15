import { BarChart3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ReportsCharts } from "@/components/reports/reports-charts";
import { ReportsDateFilter } from "@/components/reports/reports-date-filter";
import { ReportsExportButton } from "@/components/reports/reports-export-button";
import { ReportsMetricGrid } from "@/components/reports/reports-metric-grid";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { buildReportKpis } from "@/lib/reports/report-aggregates";
import {
  buildAgingChart,
  buildBottleneckChart,
  buildServiceVolumeItems,
} from "@/lib/reports/report-charts";
import {
  previousReportWindow,
  resolveReportWindow,
  toDateInputValue,
  type ReportPreset,
} from "@/lib/reports/report-window";
import { buildReportVolumeSeries } from "@/lib/reports/report-volume";
import {
  mapTicketError,
  type TicketErrorKey,
} from "@/lib/tickets/map-ticket-error";
import { listRoutingRules } from "@/services/routing-api";
import { listServices } from "@/services/service-catalog-api";
import { listTickets, type TicketResponse } from "@/services/tickets-api";

export function ReportsPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<readonly TicketResponse[] | null>(null);
  const [serviceNames, setServiceNames] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [groupNames, setGroupNames] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);
  const [preset, setPreset] = useState<ReportPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const loaded = await listTickets();
      setTickets(loaded);
      const [catalog, rules] = await Promise.all([
        listServices().catch(() => []),
        listRoutingRules().catch(() => []),
      ]);
      setServiceNames(new Map(catalog.map((service) => [service.id, service.name])));
      setGroupNames(new Map(rules.map((rule) => [rule.groupId, rule.groupName])));
    } catch (error) {
      setTickets(null);
      setErrorKey(mapTicketError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const now = useMemo(() => new Date(), [tickets]);
  const window = resolveReportWindow({
    preset,
    customFrom,
    customTo,
    now,
  });
  const kpis =
    tickets === null
      ? null
      : buildReportKpis(tickets, window, previousReportWindow(window));
  const bottleneck =
    tickets === null
      ? null
      : buildBottleneckChart(
          tickets,
          window,
          groupNames,
          t("reports.unroutedGroup"),
        );
  const serviceItems =
    tickets === null
      ? null
      : buildServiceVolumeItems(tickets, window, serviceNames);
  const volume =
    tickets === null ? null : buildReportVolumeSeries(tickets, window);
  const aging =
    tickets === null
      ? null
      : buildAgingChart(tickets, now, {
          lessThanOneDay: t("reports.agingLt1"),
          oneToThreeDays: t("reports.aging1to3"),
          threeToSevenDays: t("reports.aging3to7"),
          moreThanSevenDays: t("reports.agingGt7"),
        });

  const onPresetChange = (next: ReportPreset) => {
    if (next === "custom") {
      setCustomFrom(toDateInputValue(window.from));
      setCustomTo(toDateInputValue(now));
    }
    setPreset(next);
  };

  return (
    <section>
      <PageHeader
        crumbs={[
          "EP-HelpDesk",
          t("navigation.sections.overview"),
          t("navigation.reports"),
        ]}
        title={t("reports.title")}
        subtitle={t("reports.intro")}
        actions={
          <>
            <ReportsDateFilter
              preset={preset}
              customFrom={customFrom}
              customTo={customTo}
              onPresetChange={onPresetChange}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
            />
            <ReportsExportButton />
          </>
        }
      />
      {isLoading ? (
        <PanelSkeleton className="mt-0" label={t("reports.title")} />
      ) : errorKey ? (
        <ApiErrorText messageKey={errorKey} />
      ) : tickets === null || tickets.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={18} strokeWidth={1.8} />}
          title={t("reports.emptyTitle")}
          body={t("reports.emptyBody")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/tickets/new">{t("tickets.createAction")}</Link>
            </Button>
          }
        />
      ) : kpis === null ||
        bottleneck === null ||
        serviceItems === null ||
        volume === null ||
        aging === null ? null : (
        <>
          <ReportsMetricGrid kpis={kpis} preset={preset} />
          <ReportsCharts
            preset={preset}
            bottleneckItems={bottleneck.items}
            bottleneckLabel={bottleneck.bottleneckLabel}
            serviceItems={serviceItems}
            volume={volume}
            agingItems={aging.items}
            waitingOverSevenDays={aging.waitingOverSevenDays}
          />
        </>
      )}
    </section>
  );
}
