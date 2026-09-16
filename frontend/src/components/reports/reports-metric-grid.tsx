import { TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatCard } from "@/components/ui/stat-card";
import type { ReportDashboardKpis } from "@/services/reports-api";
import {
  deltaTone,
  formatCsat,
  formatHours,
  formatMinutes,
  formatSignedDelta,
  formatSignedPercent,
} from "@/lib/reports/report-format";
import type { ReportPreset } from "@/lib/reports/report-window";

interface ReportsMetricGridProperties {
  readonly kpis: ReportDashboardKpis;
  readonly preset: ReportPreset;
}

const windowShortKeys = {
  "15d": "reports.windowShort15d",
  "30d": "reports.windowShort30d",
  "6m": "reports.windowShort6m",
  "12m": "reports.windowShort12m",
} as const;

export function ReportsMetricGrid({
  kpis,
  preset,
}: ReportsMetricGridProperties) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const empty = t("reports.metricEmpty");
  const createdLabel =
    preset === "custom"
      ? t("reports.metricCreatedCustom")
      : t("reports.metricCreated", { window: t(windowShortKeys[preset]) });
  const createdIcon =
    kpis.createdDeltaPercent === null || kpis.createdDeltaPercent === 0 ? null : kpis.createdDeltaPercent < 0 ? (
      <TrendingDown size={15} />
    ) : (
      <TrendingUp size={15} />
    );
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard
        label={createdLabel}
        value={kpis.createdCount}
        delta={
          kpis.createdDeltaPercent === null
            ? undefined
            : formatSignedPercent(kpis.createdDeltaPercent)
        }
        deltaTone={deltaTone(kpis.createdDeltaPercent, true)}
        hint={t("reports.hintCreated", { count: kpis.createdCount })}
        icon={createdIcon}
      />
      <StatCard
        label={t("reports.metricFirstResponse")}
        value={
          kpis.firstResponseMinutes === null
            ? empty
            : formatMinutes(kpis.firstResponseMinutes, locale)
        }
        delta={
          kpis.firstResponseDeltaMinutes === null
            ? undefined
            : formatSignedDelta(kpis.firstResponseDeltaMinutes, locale, "min")
        }
        deltaTone={deltaTone(kpis.firstResponseDeltaMinutes, true)}
        hint={t("reports.hintFirstResponse", {
          count: kpis.firstResponseSampleCount,
        })}
      />
      <StatCard
        label={t("reports.metricResolution")}
        value={
          kpis.resolutionHours === null
            ? empty
            : formatHours(kpis.resolutionHours, locale)
        }
        delta={
          kpis.resolutionDeltaHours === null
            ? undefined
            : formatSignedDelta(kpis.resolutionDeltaHours, locale, "h")
        }
        deltaTone={deltaTone(kpis.resolutionDeltaHours, true)}
        hint={t("reports.hintResolution")}
      />
      <StatCard
        label={t("reports.metricCsat")}
        value={
          kpis.csatAverage === null
            ? empty
            : formatCsat(kpis.csatAverage, kpis.csatScaleMax, locale)
        }
        delta={
          kpis.csatCount === 0
            ? undefined
            : t("reports.deltaRatings", { count: kpis.csatCount })
        }
        deltaTone={kpis.csatCount === 0 ? "neutral" : "success"}
        hint={
          kpis.csatCount === 0
            ? t("reports.hintCsatNone")
            : t("reports.hintCsat", { count: kpis.csatCount })
        }
      />
    </div>
  );
}
