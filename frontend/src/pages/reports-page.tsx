import { BarChart3, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ReportPrintHeader, useLightPrintTheme } from "@/components/reports/print/report-print";
import { ReportsBottlenecksPanel } from "@/components/reports/reports-bottlenecks-panel";
import { ReportsCsatPanel } from "@/components/reports/reports-csat-panel";
import { ReportsCharts } from "@/components/reports/reports-charts";
import { ReportsDateFilter } from "@/components/reports/reports-date-filter";
import { ReportPacksPanel } from "@/components/reports/report-packs-panel";
import { ReportsMetricGrid } from "@/components/reports/reports-metric-grid";
import { ReportSchedulesPanel } from "@/components/reports/schedules/report-schedules-panel";
import type { ReportScheduleDraft } from "@/components/reports/schedules/report-schedule-sheet";
import {
  ReportTrendsPanel,
  type TrendsFilterOption,
} from "@/components/reports/trends/report-trends-panel";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { selectCompactClassName } from "@/components/ui/control";
import {
  mapAgingBars,
  mapBottleneckBars,
  mapServiceVolumeBars,
  showBottleneckChart,
} from "@/lib/reports/map-report-dashboard-charts";
import {
  formatTrendBucketLong,
  parseTrendsSearch,
  toTrendsSearch,
  type TrendsViewState,
} from "@/lib/reports/report-trends-view";
import {
  resolveReportWindow,
  toDateInputValue,
  type ReportPreset,
} from "@/lib/reports/report-window";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listGroups } from "@/services/groups-api";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import {
  fetchReportsDashboard,
  type ReportsDashboardResponse,
} from "@/services/reports-api";
import { recordReportPdfExport, type ReportTrendsResponse } from "@/services/report-trends-api";
import { listServices } from "@/services/service-catalog-api";

type ReportsTab =
  | "overview"
  | "bottlenecks"
  | "csat"
  | "trends"
  | "packs"
  | "schedules";

function readTab(value: string | null, canSchedule: boolean): ReportsTab {
  if (
    value === "trends" ||
    value === "packs" ||
    value === "bottlenecks" ||
    value === "csat"
  ) {
    return value;
  }
  if (value === "schedules" && canSchedule) return "schedules";
  return "overview";
}

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { session, hasPermission } = useSessionCapabilities();
  const canExport = hasPermission(permissionKeys.reportsExport);
  const canSchedule = hasPermission(permissionKeys.reportsScheduleManage);
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
  const [serviceOptions, setServiceOptions] = useState<readonly TrendsFilterOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<readonly TrendsFilterOption[] | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ReportScheduleDraft | null>(null);
  const [trends, setTrends] = useState<ReportTrendsResponse | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readTab(searchParams.get("tab"), canSchedule);
  const needsFilters = tab === "trends" || tab === "schedules";
  useLightPrintTheme();

  const trendsState = useMemo(
    () => parseTrendsSearch(searchParams, new Date()),
    [searchParams],
  );

  useEffect(() => {
    void listOrganizationalUnitTree()
      .then((tree) => {
        const options = flattenOriginUnitOptions(tree);
        setUnitOptions(options);
        const fromUrl = new URLSearchParams(window.location.search).get("organizationalUnitId");
        setOrganizationalUnitId(
          options.find((option) => option.id === fromUrl)?.id ?? options[0]?.id ?? null,
        );
      })
      .catch(() => setOrganizationalUnitId(null));
  }, []);

  // Service and group filters are loaded only for the tabs that use them.
  useEffect(() => {
    if (!needsFilters || serviceOptions.length > 0) return;
    void listServices()
      .then((services) =>
        setServiceOptions(
          [...services]
            .map((service) => ({ id: service.id, label: service.name }))
            .sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
        ),
      )
      .catch(() => setServiceOptions([]));
    // Groups are an admin list; without access the group filter is hidden.
    void listGroups()
      .then((groups) =>
        setGroupOptions(
          [...groups]
            .map((group) => ({ id: group.id, label: group.name }))
            .sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
        ),
      )
      .catch(() => setGroupOptions(null));
  }, [needsFilters, serviceOptions.length, i18n.language]);

  const now = useMemo(
    () => new Date(),
    [preset, customFrom, customTo, organizationalUnitId],
  );
  const window_ = resolveReportWindow({
    preset,
    customFrom,
    customTo,
    now,
  });
  const fromIso = window_.from.toISOString();
  const toIso = window_.to.toISOString();

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
    if (tab === "overview") void reload();
  }, [reload, tab]);

  const onPresetChange = (next: ReportPreset) => {
    if (next === "custom") {
      setCustomFrom(toDateInputValue(window_.from));
      setCustomTo(toDateInputValue(now));
    }
    setPreset(next);
  };

  const changeTrends = (next: TrendsViewState) => {
    setSearchParams(toTrendsSearch({ ...next, organizationalUnitId }), { replace: true });
  };

  const changeUnit = (next: string) => {
    setOrganizationalUnitId(next);
    if (tab === "trends") {
      setSearchParams(toTrendsSearch({ ...trendsState, organizationalUnitId: next }), { replace: true });
    }
  };

  const changeTab = (key: string) => {
    if (key === "trends") {
      setSearchParams(toTrendsSearch({ ...trendsState, organizationalUnitId }), { replace: true });
      return;
    }
    setSearchParams(key === "overview" ? {} : { tab: key }, { replace: true });
  };

  const unitLabel = unitOptions.find((option) => option.id === organizationalUnitId)?.label ?? "—";
  const printPeriod =
    tab === "trends"
      ? `${formatTrendBucketLong(trendsState.from, "day", i18n.language)} – ${formatTrendBucketLong(trendsState.to, "day", i18n.language)}${
          trends === null ? "" : ` (${trends.timeZone})`
        }`
      : `${window_.from.toLocaleDateString(i18n.language)} – ${window_.to.toLocaleDateString(i18n.language)}`;
  const printScope = [
    unitLabel,
    tab === "trends" && trendsState.serviceId !== null
      ? serviceOptions.find((option) => option.id === trendsState.serviceId)?.label
      : undefined,
    tab === "trends" && trendsState.groupId !== null
      ? groupOptions?.find((option) => option.id === trendsState.groupId)?.label
      : undefined,
    tab === "trends" && trendsState.priority !== null
      ? t(`reports.trends.priority.${trendsState.priority}` as "reports.trends.priority.LOW")
      : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");

  const print = (view: "overview" | "trends") => {
    if (organizationalUnitId !== null) {
      // Audit beacon only; a failure must never block printing.
      void recordReportPdfExport({
        organizationalUnitId,
        view,
        ...(view === "trends"
          ? { from: trendsState.from, to: trendsState.to }
          : { from: fromIso, to: toIso }),
      }).catch(() => undefined);
    }
    window.print();
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

  const tabs = [
    { key: "overview", label: t("reports.tabs.overview") },
    { key: "bottlenecks", label: t("reports.tabs.bottlenecks") },
    { key: "csat", label: t("reports.tabs.csat") },
    { key: "trends", label: t("reports.tabs.trends") },
    { key: "packs", label: t("reports.tabs.packs") },
    ...(canSchedule ? [{ key: "schedules", label: t("reports.tabs.schedules") }] : []),
  ];

  return (
    <section>
      <ReportPrintHeader
        title={tab === "trends" ? t("reports.trends.title") : t("reports.title")}
        scope={printScope}
        period={printPeriod}
        generatedBy={session?.principal.displayName ?? null}
      />
      <div className="print:hidden">
        <PageHeader
          crumbs={[
            brandCrumb,
            t("navigation.sections.overview"),
            t("navigation.reports"),
          ]}
          title={t("reports.title")}
          subtitle={t("reports.intro")}
          actions={
            <>
              {tab === "overview" || tab === "packs" || tab === "bottlenecks" ? (
                <ReportsDateFilter
                  preset={preset}
                  customFrom={customFrom}
                  customTo={customTo}
                  onPresetChange={onPresetChange}
                  onCustomFromChange={setCustomFrom}
                  onCustomToChange={setCustomTo}
                />
              ) : null}
              {unitOptions.length > 1 && tab !== "schedules" ? (
                <select
                  aria-label={t("reports.packs.unit")}
                  className={`${selectCompactClassName} max-w-[260px]`}
                  value={organizationalUnitId ?? ""}
                  onChange={(event) => changeUnit(event.target.value)}
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
        <UnderlineTabs className="mb-4" items={tabs} active={tab} onChange={changeTab} />
      </div>
      {tab === "csat" ? (
        <ReportsCsatPanel />
      ) : tab === "bottlenecks" ? (
        <ReportsBottlenecksPanel
          organizationalUnitId={organizationalUnitId}
          from={fromIso}
          to={toIso}
        />
      ) : tab === "packs" ? (
        <ReportPacksPanel organizationalUnitId={organizationalUnitId} from={fromIso} to={toIso} />
      ) : tab === "trends" ? (
        <ReportTrendsPanel
          state={trendsState}
          organizationalUnitId={organizationalUnitId}
          services={serviceOptions}
          groups={groupOptions}
          canExport={canExport}
          canSchedule={canSchedule}
          onChange={changeTrends}
          onPrint={() => print("trends")}
          onLoaded={setTrends}
          onSchedule={(state) => {
            setScheduleDraft({
              organizationalUnitId,
              serviceId: state.serviceId,
              groupId: state.groupId,
              priority: state.priority,
            });
            setSearchParams({ tab: "schedules" }, { replace: true });
          }}
        />
      ) : tab === "schedules" ? (
        <ReportSchedulesPanel
          units={unitOptions}
          services={serviceOptions}
          groups={groupOptions}
          draft={scheduleDraft}
          onDraftConsumed={() => setScheduleDraft(null)}
        />
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
          <div className="mb-2 flex justify-end print:hidden">
            <Button size="sm" variant="outline" onClick={() => print("overview")} data-testid="overview-print">
              <Printer size={14} /> {t("reports.print.action")}
            </Button>
          </div>
          <ReportsMetricGrid kpis={dashboard.kpis} preset={preset} />
          <ReportsCharts
            preset={preset}
            bottleneckEnabled={showBottleneckChart(dashboard)}
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
