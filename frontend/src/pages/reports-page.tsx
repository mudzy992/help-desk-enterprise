import { BarChart3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ReportsCharts } from "@/components/reports/reports-charts";
import { ReportsDateFilter } from "@/components/reports/reports-date-filter";
import { ReportPacksPanel } from "@/components/reports/report-packs-panel";
import { ReportsMetricGrid } from "@/components/reports/reports-metric-grid";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { selectCompactClassName } from "@/components/ui/control";
import {
  mapAgingBars,
  mapBottleneckBars,
  mapServiceVolumeBars,
} from "@/lib/reports/map-report-dashboard-charts";
import {
  resolveReportWindow,
  toDateInputValue,
  type ReportPreset,
} from "@/lib/reports/report-window";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import {
  fetchReportsDashboard,
  type ReportsDashboardResponse,
} from "@/services/reports-api";

export function ReportsPage() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<ReportsDashboardResponse | null>(
    null,
  );
  const [organizationalUnitId, setOrganizationalUnitId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [preset, setPreset] = useState<ReportPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [unitOptions, setUnitOptions] = useState<readonly { id: string; label: string }[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "packs" ? "packs" : "overview";

  useEffect(() => {
    void listOrganizationalUnitTree()
      .then((tree) => {
        const options = flattenOriginUnitOptions(tree);
        setUnitOptions(options);
        setOrganizationalUnitId(options[0]?.id ?? null);
      })
      .catch(() => setOrganizationalUnitId(null));
  }, []);

  const now = useMemo(
    () => new Date(),
    [preset, customFrom, customTo, organizationalUnitId],
  );
  const window = resolveReportWindow({
    preset,
    customFrom,
    customTo,
    now,
  });
  const fromIso = window.from.toISOString();
  const toIso = window.to.toISOString();

  const reload = useCallback(async () => {
    if (organizationalUnitId === null) {
      setDashboard(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const loaded = await fetchReportsDashboard({
        organizationalUnitId,
        from: fromIso,
        to: toIso,
      });
      setDashboard(loaded);
    } catch (error) {
      setDashboard(null);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [organizationalUnitId, fromIso, toIso]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onPresetChange = (next: ReportPreset) => {
    if (next === "custom") {
      setCustomFrom(toDateInputValue(window.from));
      setCustomTo(toDateInputValue(now));
    }
    setPreset(next);
  };

  const bottleneck =
    dashboard === null
      ? null
      : mapBottleneckBars(dashboard.bottleneckByGroup);
  const serviceItems =
    dashboard === null
      ? null
      : mapServiceVolumeBars(dashboard.serviceVolume);
  const agingItems =
    dashboard === null
      ? null
      : mapAgingBars(dashboard.aging, {
          lessThanOneDay: t("reports.agingLt1"),
          oneToThreeDays: t("reports.aging1to3"),
          threeToSevenDays: t("reports.aging3to7"),
          moreThanSevenDays: t("reports.agingGt7"),
        });

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
            {unitOptions.length > 1 ? (
              <select
                aria-label={t("reports.packs.unit")}
                className={`${selectCompactClassName} max-w-[260px]`}
                value={organizationalUnitId ?? ""}
                onChange={(event) => setOrganizationalUnitId(event.target.value)}
                data-testid="reports-unit"
              >
                {unitOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        }
      />
      <UnderlineTabs
        className="mb-4"
        items={[
          { key: "overview", label: t("reports.tabs.overview") },
          { key: "packs", label: t("reports.tabs.packs") },
        ]}
        active={tab}
        onChange={(key) =>
          setSearchParams(key === "packs" ? { tab: "packs" } : {}, { replace: true })
        }
      />
      {tab === "packs" ? (
        <ReportPacksPanel organizationalUnitId={organizationalUnitId} from={fromIso} to={toIso} />
      ) : isLoading ? (
        <PanelSkeleton className="mt-0" label={t("reports.title")} />
      ) : errorKey ? (
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
      ) : dashboard === null || dashboard.ticketCount === 0 ? (
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
      ) : bottleneck === null ||
        serviceItems === null ||
        agingItems === null ? null : (
        <>
          <ReportsMetricGrid kpis={dashboard.kpis} preset={preset} />
          <ReportsCharts
            preset={preset}
            bottleneckItems={bottleneck.items}
            bottleneckLabel={bottleneck.bottleneckLabel}
            serviceItems={serviceItems}
            volume={dashboard.volumeSeries}
            agingItems={agingItems}
            waitingOverSevenDays={dashboard.aging.waitingOverSevenDays}
          />
        </>
      )}
    </section>
  );
}
