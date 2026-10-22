import { CalendarClock, Download, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FilterField } from "./report-trends-widgets";
import { controlCompactClassName, selectCompactClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";
import {
  trendPresets,
  type TrendPreset,
  type TrendsViewState,
} from "@/lib/reports/report-trends-view";
import {
  reportTrendPriorities,
  type ReportTrendGranularity,
  type ReportTrendPriority,
} from "@/services/report-trends-api";
import type { ReportExportFormat } from "@/services/report-packs-api";
import type { TrendsFilterOption } from "./report-trends-panel";

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

export function ReportTrendsFilters({
  state,
  services,
  groups,
  allowed,
  automatic,
  onChange,
  onPreset,
  canExport,
  canSchedule,
  hasTrends,
  downloading,
  onDownload,
  onPrint,
  onSchedule,
}: {
  readonly state: TrendsViewState;
  readonly services: readonly TrendsFilterOption[];
  readonly groups: readonly TrendsFilterOption[] | null;
  readonly allowed: readonly ReportTrendGranularity[];
  readonly automatic: ReportTrendGranularity;
  readonly onChange: (next: TrendsViewState) => void;
  readonly onPreset: (preset: TrendPreset) => void;
  readonly canExport: boolean;
  readonly canSchedule: boolean;
  readonly hasTrends: boolean;
  readonly downloading: ReportExportFormat | null;
  readonly onDownload: (format: ReportExportFormat) => Promise<void>;
  readonly onPrint: () => void;
  readonly onSchedule: (state: TrendsViewState) => void;
}) {
  const { t } = useTranslation();
  const setPreset = onPreset;
  const trends = hasTrends ? true : null;
  const download = onDownload;
  return (
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
                event.target.value !== "" &&
                onChange({ ...state, from: event.target.value, granularity: null })
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
                event.target.value !== "" &&
                onChange({ ...state, to: event.target.value, granularity: null })
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
              granularity:
                event.target.value === "" ? null : (event.target.value as ReportTrendGranularity),
            })
          }
          data-testid="trends-granularity"
        >
          <option value="">
            {t("reports.trends.granularity.auto", { value: t(granularityKeys[automatic]) })}
          </option>
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
          onChange={(event) =>
            onChange({ ...state, serviceId: event.target.value === "" ? null : event.target.value })
          }
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
            onChange={(event) =>
              onChange({ ...state, groupId: event.target.value === "" ? null : event.target.value })
            }
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
            onChange({
              ...state,
              priority:
                event.target.value === "" ? null : (event.target.value as ReportTrendPriority),
            })
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
        <Button
          size="sm"
          variant="outline"
          disabled={trends === null}
          onClick={onPrint}
          data-testid="trends-print"
        >
          <Printer size={14} /> {t("reports.print.action")}
        </Button>
        {canSchedule ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSchedule(state)}
            data-testid="trends-schedule"
          >
            <CalendarClock size={14} /> {t("reports.trends.scheduleThis")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
