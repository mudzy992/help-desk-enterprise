import { CalendarClock, Download, HelpCircle, LineChart, Printer, Table2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TrendChart, type TrendSeries } from "@/components/charts/trend-chart";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  controlCompactClassName,
  hintClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  allowedTrendGranularities,
  estimateTrendGranularity,
  formatTrendBucketLong,
  formatTrendBucketShort,
  formatTrendHours,
  formatTrendPercent,
  readReportErrorCode,
  resolveTrendPresetRange,
  toTrendsQuery,
  trendPresets,
  type ReportTrendErrorCode,
  type TrendPreset,
  type TrendsViewState,
} from "@/lib/reports/report-trends-view";
import { cn } from "@/lib/utils";
import type { ReportExportFormat } from "@/services/report-packs-api";
import {
  downloadReportTrends,
  fetchReportTrends,
  reportTrendPriorities,
  type ReportTrendGranularity,
  type ReportTrendPriority,
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

type LoadError = { readonly code: ReportTrendErrorCode | null; readonly key: ApiErrorKey; readonly requestId: string | null };

const presetKeys = {
  "30d": "reports.trends.presets.30d",
  "90d": "reports.trends.presets.90d",
  "6m": "reports.trends.presets.6m",
  "12m": "reports.trends.presets.12m",
  "24m": "reports.trends.presets.24m",
  "36m": "reports.trends.presets.36m",
  custom: "reports.trends.presets.custom",
} as const;

const granularityKeys = {
  day: "reports.trends.granularity.day",
  week: "reports.trends.granularity.week",
  month: "reports.trends.granularity.month",
} as const;

const priorityKeys = {
  LOW: "reports.trends.priority.LOW",
  MEDIUM: "reports.trends.priority.MEDIUM",
  HIGH: "reports.trends.priority.HIGH",
  CRITICAL: "reports.trends.priority.CRITICAL",
} as const;

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

/**
 * Paket 2.5 (design §7.2): „Trendovi” — filters in the URL, six charts over
 * the same buckets, each with a table view, CSV/JSON export, print/PDF and
 * „Zakaži ovaj izvještaj”.
 */
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
  const [trends, setTrends] = useState<ReportTrendsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [downloading, setDownloading] = useState<ReportExportFormat | null>(null);

  const query = useMemo(
    () => (organizationalUnitId === null ? null : toTrendsQuery(state, organizationalUnitId)),
    [state, organizationalUnitId],
  );
  const queryKey = query === null ? null : JSON.stringify(query);

  useEffect(() => {
    if (query === null) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchReportTrends(query)
      .then((loaded) => {
        if (cancelled) return;
        setTrends(loaded);
        onLoaded?.(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setTrends(null);
        onLoaded?.(null);
        setError({ code: readReportErrorCode(caught), key: mapApiError(caught), requestId: readApiRequestId(caught) });
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the serialized query is the dependency
  }, [queryKey]);

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
      toast({ title: code === null ? t(mapApiError(caught)) : t(errorKeys[code]), tone: "danger" });
    } finally {
      setDownloading(null);
    }
  };

  const granularity: ReportTrendGranularity = trends?.granularity ?? state.granularity ?? automatic;
  const points = trends?.points ?? [];
  const labels = points.map((point) => formatTrendBucketShort(point.key, granularity, locale));
  const tooltipLabels = points.map((point) => formatTrendBucketLong(point.key, granularity, locale));
  const partialLast = points[points.length - 1]?.partial === true;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const hours = (value: number) => formatTrendHours(value, locale);
  const percent = (value: number) => formatTrendPercent(value, locale);
  const csatFormat = (value: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

  const filterBar = (
    <div className="mb-3 flex flex-wrap items-end gap-2 print:hidden" data-testid="trends-filters">
      <FilterField label={t("reports.trends.filters.range")}>
        <select
          className={selectCompactClassName}
          value={state.preset}
          onChange={(event) => setPreset(event.target.value as TrendPreset)}
          data-testid="trends-preset"
        >
          {trendPresets.map((preset) => (
            <option key={preset} value={preset}>
              {t(presetKeys[preset])}
            </option>
          ))}
        </select>
      </FilterField>
      {state.preset === "custom" ? (
        <>
          <FilterField label={t("reports.windowFrom")}>
            <input
              type="date"
              className={controlCompactClassName}
              value={state.from}
              max={state.to}
              onChange={(event) =>
                event.target.value !== "" && onChange({ ...state, from: event.target.value, granularity: null })
              }
              data-testid="trends-from"
            />
          </FilterField>
          <FilterField label={t("reports.windowTo")}>
            <input
              type="date"
              className={controlCompactClassName}
              value={state.to}
              min={state.from}
              onChange={(event) =>
                event.target.value !== "" && onChange({ ...state, to: event.target.value, granularity: null })
              }
              data-testid="trends-to"
            />
          </FilterField>
        </>
      ) : null}
      <FilterField label={t("reports.trends.filters.granularity")}>
        <select
          className={selectCompactClassName}
          value={state.granularity ?? ""}
          onChange={(event) =>
            onChange({
              ...state,
              granularity: event.target.value === "" ? null : (event.target.value as ReportTrendGranularity),
            })
          }
          data-testid="trends-granularity"
        >
          <option value="">{t("reports.trends.granularity.auto", { value: t(granularityKeys[automatic]) })}</option>
          {allowed.map((option) => (
            <option key={option} value={option}>
              {t(granularityKeys[option])}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label={t("reports.trends.filters.service")}>
        <select
          className={cn(selectCompactClassName, "max-w-[220px]")}
          value={state.serviceId ?? ""}
          onChange={(event) => onChange({ ...state, serviceId: event.target.value === "" ? null : event.target.value })}
          data-testid="trends-service"
        >
          <option value="">{t("reports.trends.filters.all")}</option>
          {services.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterField>
      {groups !== null ? (
        <FilterField label={t("reports.trends.filters.group")}>
          <select
            className={cn(selectCompactClassName, "max-w-[220px]")}
            value={state.groupId ?? ""}
            onChange={(event) => onChange({ ...state, groupId: event.target.value === "" ? null : event.target.value })}
            data-testid="trends-group"
          >
            <option value="">{t("reports.trends.filters.all")}</option>
            {groups.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
      ) : null}
      <FilterField label={t("reports.trends.filters.priority")}>
        <select
          className={selectCompactClassName}
          value={state.priority ?? ""}
          onChange={(event) =>
            onChange({ ...state, priority: event.target.value === "" ? null : (event.target.value as ReportTrendPriority) })
          }
          data-testid="trends-priority"
        >
          <option value="">{t("reports.trends.filters.all")}</option>
          {reportTrendPriorities.map((priority) => (
            <option key={priority} value={priority}>
              {t(priorityKeys[priority])}
            </option>
          ))}
        </select>
      </FilterField>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {canExport ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={trends === null || downloading !== null}
              onClick={() => void download("csv")}
              data-testid="trends-export-csv"
            >
              <Download size={14} /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={trends === null || downloading !== null}
              onClick={() => void download("json")}
            >
              <Download size={14} /> JSON
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="outline" disabled={trends === null} onClick={onPrint} data-testid="trends-print">
          <Printer size={14} /> {t("reports.print.action")}
        </Button>
        {canSchedule ? (
          <Button size="sm" variant="secondary" onClick={() => onSchedule(state)} data-testid="trends-schedule">
            <CalendarClock size={14} /> {t("reports.trends.scheduleThis")}
          </Button>
        ) : null}
      </div>
    </div>
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
          <p className="rounded-md border border-border bg-surface px-4 py-3 text-[13px] text-foreground" role="alert">
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
    { key: "net", label: t("reports.trends.series.net"), kind: "bar", tone: "muted", values: points.map((p) => p.net), format: number },
    { key: "created", label: t("reports.trends.series.created"), kind: "line", tone: "primary", values: points.map((p) => p.created), format: number },
    { key: "resolved", label: t("reports.trends.series.resolved"), kind: "line", tone: "ok", values: points.map((p) => p.resolved), format: number },
  ];
  const backlogSeries: TrendSeries[] = [
    { key: "backlog", label: t("reports.trends.series.backlog"), kind: "line", tone: "warning", values: points.map((p) => p.backlog), format: number },
  ];
  const slaSeries: TrendSeries[] = [
    { key: "slaResponse", label: t("reports.trends.series.slaResponse"), kind: "line", tone: "primary", values: points.map((p) => p.slaResponse.percent), format: percent },
    { key: "slaResolution", label: t("reports.trends.series.slaResolution"), kind: "line", tone: "ok", values: points.map((p) => p.slaResolution.percent), format: percent },
  ];
  const durationSeries: TrendSeries[] = [
    { key: "resolutionMedian", label: t("reports.trends.series.resolutionMedian"), kind: "line", tone: "primary", values: points.map((p) => p.resolution.medianHours), format: hours },
    { key: "resolutionP90", label: t("reports.trends.series.resolutionP90"), kind: "line", tone: "warning", values: points.map((p) => p.resolution.p90Hours), format: hours },
    { key: "firstResponseMedian", label: t("reports.trends.series.firstResponseMedian"), kind: "line", tone: "info", values: points.map((p) => p.firstResponse.medianHours), format: hours },
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
    (point, index) => `${tooltipLabels[index] ?? ""} · ${t("reports.trends.ratings", { count: point.csat.count })}`,
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
              subtitle={t("reports.trends.cards.sla.subtitle", { target: settings.slaTargetPercent })}
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
                target={{ value: settings.slaTargetPercent, label: t("reports.trends.target", { value: settings.slaTargetPercent }) }}
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

function slaTone(percent: number | null, target: number): "ok" | "danger" | undefined {
  if (percent === null) return undefined;
  return percent >= target ? "ok" : "danger";
}

function FilterField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: "ok" | "warning" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-card">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum mt-0.5 text-[18px] font-semibold text-foreground",
          tone === "ok" && "text-ok",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint !== undefined ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TrendCard({
  title,
  subtitle,
  how,
  labels,
  series,
  footer,
  children,
  testId,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly how: string;
  readonly labels: readonly string[];
  readonly series: readonly TrendSeries[];
  readonly footer?: string;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const [showHow, setShowHow] = useState(false);
  return (
    <Card className="fade-in print-avoid-break" data-testid={testId}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-1 print:hidden">
            <Button
              size="xs"
              variant="ghost"
              aria-expanded={showHow}
              onClick={() => setShowHow((current) => !current)}
            >
              <HelpCircle size={13} /> {t("reports.trends.how")}
            </Button>
            <Button size="xs" variant="ghost" aria-pressed={asTable} onClick={() => setAsTable((current) => !current)}>
              {asTable ? <LineChart size={13} /> : <Table2 size={13} />}
              {asTable ? t("reports.trends.showChart") : t("reports.trends.showTable")}
            </Button>
          </div>
        }
      />
      <div className="px-4 py-4">
        {showHow ? (
          <p className="mb-3 rounded-md bg-surface-hover px-3 py-2 text-[12px] leading-5 text-muted-foreground">{how}</p>
        ) : null}
        {asTable ? <SeriesTable labels={labels} series={series} /> : children}
        {footer !== undefined ? <p className={cn(hintClassName, "mt-2")}>{footer}</p> : null}
      </div>
    </Card>
  );
}

function SeriesTable({ labels, series }: { readonly labels: readonly string[]; readonly series: readonly TrendSeries[] }) {
  const { t } = useTranslation();
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-surface">
          <tr className={tableHeadClassName}>
            <th className="px-2 py-1.5 text-left">{t("reports.trends.period")}</th>
            {series.map((item) => (
              <th key={item.key} className="px-2 py-1.5 text-right">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={`${label}-${index}`} className={tableRowClassName}>
              <td className="px-2">{label}</td>
              {series.map((item) => {
                const value = item.values[index] ?? null;
                return (
                  <td key={item.key} className="tnum px-2 text-right">
                    {value === null ? "—" : item.format(value)}
                    {item.lowSample?.[index] === true ? " *" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopServicesCard({ trends, locale }: { readonly trends: ReportTrendsResponse; readonly locale: string }) {
  const { t } = useTranslation();
  const top = trends.topServices;
  const max = Math.max(1, ...top.items.map((item) => item.current));
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  return (
    <Card className="fade-in print-avoid-break" data-testid="trends-card-services">
      <CardHeader title={t("reports.trends.cards.services.title")} subtitle={t("reports.trends.cards.services.subtitle")} />
      <div className="px-4 py-3">
        {top.items.length === 0 ? (
          <p className={hintClassName}>{t("reports.trends.cards.services.empty")}</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className={tableHeadClassName}>
                <th className="py-1.5 text-left">{t("reports.trends.cards.services.service")}</th>
                <th className="w-[38%] py-1.5" />
                <th className="py-1.5 text-right">{t("reports.trends.cards.services.current")}</th>
                <th className="py-1.5 text-right">{t("reports.trends.cards.services.change")}</th>
              </tr>
            </thead>
            <tbody>
              {top.items.map((item) => (
                <tr key={item.serviceId} className={tableRowClassName}>
                  <td className="max-w-[180px] truncate pr-2">{item.name}</td>
                  <td className="pr-3">
                    <div className="h-2 rounded-full bg-surface-hover">
                      <div className="h-2 rounded-full bg-primary/70" style={{ width: `${(item.current / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className="tnum text-right">{number(item.current)}</td>
                  <td className="text-right">
                    <ChangeBadge value={item.changePercent} previous={item.previous} locale={locale} />
                  </td>
                </tr>
              ))}
              {top.other.current > 0 || top.other.previous > 0 ? (
                <tr className={tableRowClassName}>
                  <td className="text-muted-foreground">{t("reports.trends.cards.services.other")}</td>
                  <td />
                  <td className="tnum text-right text-muted-foreground">{number(top.other.current)}</td>
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function ChangeBadge({
  value,
  previous,
  locale,
}: {
  readonly value: number | null;
  readonly previous: number;
  readonly locale: string;
}) {
  const { t } = useTranslation();
  if (value === null) {
    return <span className="text-[11.5px] text-muted-foreground">{previous === 0 ? t("reports.trends.new") : "—"}</span>;
  }
  const formatted = `${value > 0 ? "+" : ""}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} %`;
  return (
    <Badge tone={value > 0 ? "warning" : value < 0 ? "success" : "neutral"}>{formatted}</Badge>
  );
}
