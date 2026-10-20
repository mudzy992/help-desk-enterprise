import { BarChart3, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PageHeader, brandCrumb } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { selectCompactClassName } from "@/components/ui/control";
import {
  mapAgingBars,
  mapBottleneckBars,
  mapCountBars,
  mapServiceVolumeBars,
  mapWorkloadBars,
  showBottleneckChart,
} from "@/lib/reports/map-report-dashboard-charts";
import {
  formatTrendBucketLong,
  parseTrendsSearch,
  toTrendsSearch,
  type TrendsViewState,
} from "@/lib/reports/report-trends-view";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import {
  resolveReportWindow,
  toDateInputValue,
  type ReportPreset,
} from "@/lib/reports/report-window";
import { parseReportPageSearch, updateReportPageSearch } from "@/lib/reports/report-page-search";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import { fetchReportsDashboard, type ReportsDashboardResponse } from "@/services/reports-api";
import { recordReportPdfExport, type ReportTrendsResponse } from "@/services/report-trends-api";

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { session, hasPermission } = useSessionCapabilities();
  const canExport = hasPermission(permissionKeys.reportsExport);
  const canSchedule = hasPermission(permissionKeys.reportsScheduleManage);
  const [dashboard, setDashboard] = useState<ReportsDashboardResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const [unitError, setUnitError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(
    null,
  );
  const dashboardGuard = useRef(createLatestRequestGuard());
  const [unitOptions, setUnitOptions] = useState<readonly { id: string; label: string }[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<ReportScheduleDraft | null>(null);
  const [trends, setTrends] = useState<ReportTrendsResponse | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSearch = useMemo(
    () => parseReportPageSearch(searchParams, canSchedule),
    [canSchedule, searchParams],
  );
  const { tab, organizationalUnitId, preset, customFrom, customTo } = pageSearch;
  const needsFilters = tab === "trends" || tab === "schedules";
  useLightPrintTheme();

  const trendsState = useMemo(() => parseTrendsSearch(searchParams, new Date()), [searchParams]);

  const loadUnits = useCallback(async () => {
    setUnitError(null);
    try {
      const tree = await listOrganizationalUnitTree();
      setUnitOptions(flattenOriginUnitOptions(tree));
    } catch (error) {
      setUnitError({ key: mapApiError(error), requestId: readApiRequestId(error) });
    }
  }, []);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    if (unitOptions.length === 0) return;
    const resolved =
      unitOptions.find((option) => option.id === organizationalUnitId)?.id ??
      unitOptions[0]?.id ??
      null;
    if (resolved !== organizationalUnitId) {
      setSearchParams(
        (current) => updateReportPageSearch(current, { organizationalUnitId: resolved }),
        { replace: true },
      );
    }
  }, [organizationalUnitId, setSearchParams, unitOptions]);

  const filters = useReportFilterOptions(needsFilters, i18n.language);
  const serviceOptions: readonly TrendsFilterOption[] = filters.services;
  const groupOptions: readonly TrendsFilterOption[] = filters.groups;

  const reportWindowKey = `${preset}|${customFrom}|${customTo}|${organizationalUnitId}`;
  const now = useMemo(() => {
    // Re-anchor relative ranges only when the report filter changes.
    void reportWindowKey;
    return new Date();
  }, [reportWindowKey]);
  const window_ = resolveReportWindow({
    preset,
    customFrom,
    customTo,
    now,
  });
  const fromIso = window_?.from.toISOString() ?? null;
  const toIso = window_?.to.toISOString() ?? null;

  const reload = useCallback(async () => {
    const request = dashboardGuard.current.begin();
    if (organizationalUnitId === null || fromIso === null || toIso === null) {
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
      if (dashboardGuard.current.isCurrent(request)) setDashboard(loaded);
    } catch (error) {
      if (!dashboardGuard.current.isCurrent(request)) return;
      setDashboard(null);
      setErrorKey(mapApiError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      if (dashboardGuard.current.isCurrent(request)) setIsLoading(false);
    }
  }, [organizationalUnitId, fromIso, toIso]);

  useEffect(() => {
    if (tab === "overview") void reload();
  }, [reload, tab]);

  const onPresetChange = (next: ReportPreset) => {
    if (next === "custom") {
      const current =
        window_ ?? resolveReportWindow({ preset: "30d", customFrom: "", customTo: "", now });
      setSearchParams(
        (params) =>
          updateReportPageSearch(params, {
            preset: next,
            customFrom: current === null ? "" : toDateInputValue(current.from),
            customTo: toDateInputValue(now),
          }),
        { replace: true },
      );
      return;
    }
    setSearchParams((params) => updateReportPageSearch(params, { preset: next }), {
      replace: true,
    });
  };

  const writeTrendsSearch = (next: TrendsViewState) => {
    const trendParams = toTrendsSearch({ ...next, organizationalUnitId });
    setSearchParams(
      (current) => {
        const merged = new URLSearchParams(current);
        for (const key of [
          "tab",
          "preset",
          "from",
          "to",
          "granularity",
          "organizationalUnitId",
          "serviceId",
          "groupId",
          "priority",
        ])
          merged.delete(key);
        trendParams.forEach((value, key) => merged.set(key, value));
        return merged;
      },
      { replace: true },
    );
  };

  const changeTrends = (next: TrendsViewState) => writeTrendsSearch(next);

  const changeUnit = (next: string) => {
    if (tab === "trends") {
      writeTrendsSearch({ ...trendsState, organizationalUnitId: next });
    } else {
      setSearchParams((params) => updateReportPageSearch(params, { organizationalUnitId: next }), {
        replace: true,
      });
    }
  };

  const changeTab = (key: string) => {
    if (key === "trends") {
      writeTrendsSearch(trendsState);
      return;
    }
    setSearchParams((params) => updateReportPageSearch(params, { tab: key as typeof tab }), {
      replace: true,
    });
  };

  const unitLabel = unitOptions.find((option) => option.id === organizationalUnitId)?.label ?? "—";
  const printPeriod =
    tab === "trends"
      ? `${formatTrendBucketLong(trendsState.from, "day", i18n.language)} – ${formatTrendBucketLong(trendsState.to, "day", i18n.language)}${
          trends === null ? "" : ` (${trends.timeZone})`
        }`
      : window_ === null
        ? t("reports.errors.REPORT_WINDOW_INVALID")
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
    if (organizationalUnitId !== null && fromIso !== null && toIso !== null) {
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

  const bottleneck = dashboard === null ? null : mapBottleneckBars(dashboard.bottleneckByGroup);
  const serviceItems = dashboard === null ? null : mapServiceVolumeBars(dashboard.serviceVolume);
  const unitItems = dashboard === null ? null : mapCountBars(dashboard.originUnitVolume);
  const workloadItems = dashboard === null ? null : mapWorkloadBars(dashboard.assigneeWorkload);
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
          crumbs={[brandCrumb, t("navigation.sections.overview"), t("navigation.reports")]}
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
                  invalid={window_ === null}
                  onCustomFromChange={(value) =>
                    setSearchParams(
                      (params) => updateReportPageSearch(params, { customFrom: value }),
                      { replace: true },
                    )
                  }
                  onCustomToChange={(value) =>
                    setSearchParams(
                      (params) => updateReportPageSearch(params, { customTo: value }),
                      { replace: true },
                    )
                  }
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
      {needsFilters && (filters.serviceError ?? filters.groupError) ? (
        <div className="mb-4 grid gap-2">
          <ApiErrorText
            messageKey={(filters.serviceError ?? filters.groupError)!.key}
            requestId={(filters.serviceError ?? filters.groupError)!.requestId}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={filters.isLoading}
            onClick={() => void filters.load()}
          >
            {filters.isLoading ? t("ui.loading") : t("ui.retry")}
          </Button>
        </div>
      ) : null}
      {window_ === null && (tab === "overview" || tab === "packs" || tab === "bottlenecks") ? (
        <ApiErrorText messageKey="reports.errors.REPORT_WINDOW_INVALID" requestId={null} />
      ) : unitError ? (
        <div className="grid gap-2">
          <ApiErrorText messageKey={unitError.key} requestId={unitError.requestId} />
          <Button size="sm" variant="outline" onClick={() => void loadUnits()}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : tab === "csat" ? (
        <ReportsCsatPanel />
      ) : tab === "bottlenecks" ? (
        <ReportsBottlenecksPanel
          organizationalUnitId={organizationalUnitId}
          from={fromIso!}
          to={toIso!}
        />
      ) : tab === "packs" ? (
        <ReportPacksPanel organizationalUnitId={organizationalUnitId} from={fromIso!} to={toIso!} />
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
            setSearchParams((params) => updateReportPageSearch(params, { tab: "schedules" }), {
              replace: true,
            });
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
        unitItems === null ||
        workloadItems === null ||
        agingItems === null ? null : (
        <>
          <div className="mb-2 flex justify-end print:hidden">
            <Button
              size="sm"
              variant="outline"
              onClick={() => print("overview")}
              data-testid="overview-print"
            >
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
            unitItems={unitItems}
            workloadItems={workloadItems}
            volume={dashboard.volumeSeries}
            agingItems={agingItems}
            waitingOverSevenDays={dashboard.aging.waitingOverSevenDays}
          />
        </>
      )}
    </section>
  );
}
