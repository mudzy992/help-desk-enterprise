import { ReportTrendsFilters } from "./report-trends-filters";
import { Tile, TopServicesCard, TrendCard, slaTone } from "./report-trends-widgets";
import { LineChart } from "lucide-react";
import { useState } from "react";
import { TrendChart, type TrendSeries } from "@/components/charts/trend-chart";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { mapApiError } from "@/lib/map-api-error";
import {
  allowedTrendGranularities,
  estimateTrendGranularity,
  formatTrendBucketLong,
  formatTrendHours,
  formatTrendPercent,
  formatTrendBucketShort,
  readReportErrorCode,
  resolveTrendPresetRange,
  type ReportTrendErrorCode,
  type TrendPreset,
  type TrendsViewState,
} from "@/lib/reports/report-trends-view";
import { cn } from "@/lib/utils";
import { useReportTrendsData } from "@/lib/reports/use-report-trends-data";
import type { ReportExportFormat } from "@/services/report-packs-api";
import {
  downloadReportTrends,
  type ReportTrendGranularity,
  type ReportTrendsResponse,
} from "@/services/report-trends-api";

export type TrendsFilterOption = { readonly id: string; readonly label: string };

interface ReportTrendsPanelProperties {
  readonly state: TrendsViewState;
  readonly organizationalUnitId: string | null;
  readonly services: readonly TrendsFilterOption[];
  readonly groups: readonly TrendsFilterOption[] | null;
  readonly canExport: boolean;
  readonly canSchedule: boolean;
  readonly onChange: (next: TrendsViewState) => void;
  readonly onSchedule: (state: TrendsViewState) => void;
  readonly onPrint: () => void;
  readonly onLoaded?: (trends: ReportTrendsResponse | null) => void;
}

const errorKeys = {
  REPORT_WINDOW_INVALID: "reports.errors.REPORT_WINDOW_INVALID",
  REPORT_GRANULARITY_INVALID: "reports.errors.REPORT_GRANULARITY_INVALID",
  REPORT_TRENDS_DISABLED: "reports.errors.REPORT_TRENDS_DISABLED",
  REPORTS_DISABLED: "reports.errors.REPORTS_DISABLED",
  BOTTLENECKS_DISABLED: "reports.errors.BOTTLENECKS_DISABLED",
  REPORT_ORGANIZATIONAL_UNIT_NOT_FOUND: "reports.errors.REPORT_ORGANIZATIONAL_UNIT_NOT_FOUND",
  REPORT_FORMAT_NOT_ALLOWED: "reports.errors.REPORT_FORMAT_NOT_ALLOWED",
  REPORT_SCHEDULE_DISABLED: "reports.errors.REPORT_SCHEDULE_DISABLED",
  REPORT_SCHEDULE_NOT_FOUND: "reports.errors.REPORT_SCHEDULE_NOT_FOUND",
  REPORT_SCHEDULE_LIMIT: "reports.errors.REPORT_SCHEDULE_LIMIT",
  REPORT_SCHEDULE_INVALID: "reports.errors.REPORT_SCHEDULE_INVALID",
  REPORT_RECIPIENT_INVALID: "reports.errors.REPORT_RECIPIENT_INVALID",
  REPORT_RECIPIENT_LIMIT: "reports.errors.REPORT_RECIPIENT_LIMIT",
} as const satisfies Record<ReportTrendErrorCode, string>;

export { errorKeys as reportErrorMessageKeys };

/** Six charts share one query and support table, export, print and scheduling views. */
export function ReportTrendsPanel({
  state,
  organizationalUnitId,
  services,
  groups,
  canExport,
  canSchedule,
  onChange,
  onSchedule,
  onPrint,
  onLoaded,
}: ReportTrendsPanelProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const locale = i18n.language;
  const { trends, isLoading, error, query } = useReportTrendsData(
    state,
    organizationalUnitId,
    onLoaded,
  );
  const [downloading, setDownloading] = useState<ReportExportFormat | null>(null);

  const allowed = allowedTrendGranularities(state.from, state.to);
  const automatic = estimateTrendGranularity(state.from, state.to);

  const setPreset = (preset: TrendPreset) => {
    const range = resolveTrendPresetRange(preset, new Date());
    onChange({ ...state, preset, ...(range ?? {}), granularity: null });
  };

  const download = async (format: ReportExportFormat) => {
    if (query === null) return;
    setDownloading(format);
    try {
      const file = await downloadReportTrends(query, format);
      triggerBlobDownload(file.blob, file.fileName);
      toast({ title: t("reports.packs.downloaded", { file: file.fileName }) });
    } catch (caught) {
      const code = readReportErrorCode(caught);
      toast({
        title: code === null ? t(mapApiError(caught)) : t(errorKeys[code]),
        tone: "danger",
        error: caught,
      });
    } finally {
      setDownloading(null);
    }
  };

  const granularity: ReportTrendGranularity = trends?.granularity ?? state.granularity ?? automatic;
  const points = trends?.points ?? [];
  const labels = points.map((point) => formatTrendBucketShort(point.key, granularity, locale));
  const tooltipLabels = points.map((point) =>
    formatTrendBucketLong(point.key, granularity, locale),
  );
  const partialLast = points[points.length - 1]?.partial === true;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const hours = (value: number) => formatTrendHours(value, locale);
  const percent = (value: number) => formatTrendPercent(value, locale);
  const csatFormat = (value: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      value,
    );

  const filterBar = (
    <ReportTrendsFilters
      state={state}
      services={services}
      groups={groups}
      allowed={allowed}
      automatic={automatic}
      onChange={onChange}
      onPreset={setPreset}
      canExport={canExport}
      canSchedule={canSchedule}
      hasTrends={trends !== null}
      downloading={downloading}
      onDownload={download}
      onPrint={onPrint}
      onSchedule={onSchedule}
    />
  );

  if (isLoading && trends === null) {
    return (
      <>
        {filterBar}
        <PanelSkeleton className="mt-0" label={t("reports.trends.title")} />
      </>
    );
  }
  if (error !== null) {
    return (
      <>
        {filterBar}
        {error.code !== null ? (
          <p
            className="rounded-md border border-border bg-surface px-4 py-3 text-[13px] text-foreground"
            role="alert"
          >
            {t(errorKeys[error.code])}
          </p>
        ) : (
          <ApiErrorText messageKey={error.key} requestId={error.requestId} />
        )}
      </>
    );
  }
  if (trends === null) return filterBar;

  const totals = trends.totals;
  const hasData = totals.created > 0 || totals.resolved > 0 || totals.backlogStart > 0;
  const settings = trends.settings;

  const flowSeries: TrendSeries[] = [
    {
      key: "net",
      label: t("reports.trends.series.net"),
      kind: "bar",
      tone: "muted",
      values: points.map((p) => p.net),
      format: number,
    },
    {
      key: "created",
      label: t("reports.trends.series.created"),
      kind: "line",
      tone: "primary",
      values: points.map((p) => p.created),
      format: number,
    },
    {
      key: "resolved",
      label: t("reports.trends.series.resolved"),
      kind: "line",
      tone: "ok",
      values: points.map((p) => p.resolved),
      format: number,
    },
  ];
  const backlogSeries: TrendSeries[] = [
    {
      key: "backlog",
      label: t("reports.trends.series.backlog"),
      kind: "line",
      tone: "warning",
      values: points.map((p) => p.backlog),
      format: number,
    },
  ];
  const slaSeries: TrendSeries[] = [
    {
      key: "slaResponse",
      label: t("reports.trends.series.slaResponse"),
      kind: "line",
      tone: "primary",
      values: points.map((p) => p.slaResponse.percent),
      format: percent,
    },
    {
      key: "slaResolution",
      label: t("reports.trends.series.slaResolution"),
      kind: "line",
      tone: "ok",
      values: points.map((p) => p.slaResolution.percent),
      format: percent,
    },
  ];
  const durationSeries: TrendSeries[] = [
    {
      key: "resolutionMedian",
      label: t("reports.trends.series.resolutionMedian"),
      kind: "line",
      tone: "primary",
      values: points.map((p) => p.resolution.medianHours),
      format: hours,
    },
    {
      key: "resolutionP90",
      label: t("reports.trends.series.resolutionP90"),
      kind: "line",
      tone: "warning",
      values: points.map((p) => p.resolution.p90Hours),
      format: hours,
    },
    {
      key: "firstResponseMedian",
      label: t("reports.trends.series.firstResponseMedian"),
      kind: "line",
      tone: "info",
      values: points.map((p) => p.firstResponse.medianHours),
      format: hours,
    },
  ];
  const csatSeries: TrendSeries[] = [
    {
      key: "csatAverage",
      label: t("reports.trends.series.csatAverage", { max: settings.csatScaleMax }),
      kind: "line",
      tone: "ok",
      values: points.map((p) => p.csat.average),
      format: csatFormat,
      lowSample: points.map((p) => p.csat.lowSample),
    },
  ];
  const csatTooltips = points.map(
    (point, index) =>
      `${tooltipLabels[index] ?? ""} · ${t("reports.trends.ratings", { count: point.csat.count })}`,
  );

  return (
    <div data-testid="trends-panel">
      {filterBar}
      {!hasData ? (
        <EmptyState
          icon={<LineChart size={18} strokeWidth={1.8} />}
          title={t("reports.trends.emptyTitle")}
          body={t("reports.trends.emptyBody")}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7 print-avoid-break">
            <Tile label={t("reports.trends.series.created")} value={number(totals.created)} />
            <Tile label={t("reports.trends.series.resolved")} value={number(totals.resolved)} />
            <Tile
              label={t("reports.trends.series.net")}
              value={`${totals.net > 0 ? "+" : ""}${number(totals.net)}`}
              tone={totals.net > 0 ? "warning" : totals.net < 0 ? "ok" : undefined}
            />
            <Tile
              label={t("reports.trends.backlogEnd")}
              value={number(totals.backlogEnd)}
              hint={t("reports.trends.backlogStart", { value: number(totals.backlogStart) })}
            />
            <Tile
              label={t("reports.trends.series.slaResponse")}
              value={formatTrendPercent(totals.slaResponse.percent, locale)}
              tone={slaTone(totals.slaResponse.percent, settings.slaTargetPercent)}
            />
            <Tile
              label={t("reports.trends.series.slaResolution")}
              value={formatTrendPercent(totals.slaResolution.percent, locale)}
              tone={slaTone(totals.slaResolution.percent, settings.slaTargetPercent)}
            />
            <Tile
              label={t("reports.trends.csatTile", { max: settings.csatScaleMax })}
              value={totals.csat.average === null ? "—" : csatFormat(totals.csat.average)}
              hint={t("reports.trends.ratings", { count: totals.csat.count })}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <TrendCard
              title={t("reports.trends.cards.flow.title")}
              subtitle={t("reports.trends.cards.flow.subtitle")}
              how={t("reports.trends.cards.flow.how")}
              labels={tooltipLabels}
              series={flowSeries}
              testId="trends-card-flow"
            >
              <TrendChart
                labels={labels}
                tooltipLabels={tooltipLabels}
                series={flowSeries}
                partialLast={partialLast}
                partialLabel={t("reports.trends.partial")}
              />
            </TrendCard>
            <TrendCard
              title={t("reports.trends.cards.backlog.title")}
              subtitle={t("reports.trends.cards.backlog.subtitle")}
              how={t("reports.trends.cards.backlog.how")}
              labels={tooltipLabels}
              series={backlogSeries}
            >
              <TrendChart
                labels={labels}
                tooltipLabels={tooltipLabels}
                series={backlogSeries}
                partialLast={partialLast}
                partialLabel={t("reports.trends.partial")}
              />
            </TrendCard>
            <TrendCard
              title={t("reports.trends.cards.sla.title")}
              subtitle={t("reports.trends.cards.sla.subtitle", {
                target: settings.slaTargetPercent,
              })}
              how={t("reports.trends.cards.sla.how")}
              labels={tooltipLabels}
              series={slaSeries}
              footer={
                totals.resolvedWithoutSla > 0
                  ? t("reports.trends.withoutSla", { count: totals.resolvedWithoutSla })
                  : undefined
              }
            >
              <TrendChart
                labels={labels}
                tooltipLabels={tooltipLabels}
                series={slaSeries}
                partialLast={partialLast}
                partialLabel={t("reports.trends.partial")}
                yMax={100}
                target={{
                  value: settings.slaTargetPercent,
                  label: t("reports.trends.target", { value: settings.slaTargetPercent }),
                }}
              />
            </TrendCard>
            <TrendCard
              title={t("reports.trends.cards.duration.title")}
              subtitle={t("reports.trends.cards.duration.subtitle")}
              how={t("reports.trends.cards.duration.how")}
              labels={tooltipLabels}
              series={durationSeries}
            >
              <TrendChart
                labels={labels}
                tooltipLabels={tooltipLabels}
                series={durationSeries}
                partialLast={partialLast}
                partialLabel={t("reports.trends.partial")}
              />
            </TrendCard>
            <TrendCard
              title={t("reports.trends.cards.csat.title")}
              subtitle={t("reports.trends.cards.csat.subtitle", {
                min: settings.csatSatisfiedMinRating,
                sample: settings.csatMinSample,
              })}
              how={t("reports.trends.cards.csat.how", { sample: settings.csatMinSample })}
              labels={csatTooltips}
              series={[
                ...csatSeries,
                {
                  key: "csatSatisfied",
                  label: t("reports.trends.series.csatSatisfied"),
                  kind: "line",
                  tone: "primary",
                  values: points.map((p) => p.csat.satisfiedPercent),
                  format: percent,
                },
              ]}
            >
              <TrendChart
                labels={labels}
                tooltipLabels={csatTooltips}
                series={csatSeries}
                partialLast={partialLast}
                partialLabel={t("reports.trends.partial")}
                lowSampleLabel={t("reports.trends.lowSample", { sample: settings.csatMinSample })}
                yMax={settings.csatScaleMax}
              />
            </TrendCard>
            <TopServicesCard trends={trends} locale={locale} />
          </div>

          <p className={cn(hintClassName, "mt-3")}>
            {t("reports.trends.meta", {
              zone: trends.timeZone,
              generated: new Date(trends.generatedAt).toLocaleString(locale),
            })}
          </p>
        </>
      )}
    </div>
  );
}
