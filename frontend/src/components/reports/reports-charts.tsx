import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { GroupedBars } from "@/components/charts/grouped-bars";
import { HBars } from "@/components/charts/h-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { GroupedBarDatum } from "@/components/charts/grouped-bars";
import type { HorizontalBarItem } from "@/components/charts/h-bars";
import type { ReportPreset } from "@/lib/reports/report-window";

interface ReportsChartsProperties {
  readonly preset: ReportPreset;
  readonly bottleneckItems: readonly HorizontalBarItem[];
  readonly bottleneckLabel: string | null;
  readonly serviceItems: readonly HorizontalBarItem[];
  readonly volume: readonly GroupedBarDatum[];
  readonly agingItems: readonly HorizontalBarItem[];
  readonly waitingOverSevenDays: number;
}

const windowShortKeys = {
  "15d": "reports.windowShort15d",
  "30d": "reports.windowShort30d",
  "6m": "reports.windowShort6m",
  "12m": "reports.windowShort12m",
} as const;

export function ReportsCharts({
  preset,
  bottleneckItems,
  bottleneckLabel,
  serviceItems,
  volume,
  agingItems,
  waitingOverSevenDays,
}: ReportsChartsProperties) {
  const { t } = useTranslation();
  const volumeTitle =
    preset === "custom"
      ? t("reports.volumeTitleCustom")
      : t("reports.volumeTitle", { window: t(windowShortKeys[preset]) });
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
      <Card className="fade-in">
        <CardHeader
          title={t("reports.bottleneckTitle")}
          subtitle={t("reports.bottleneckSubtitle")}
          actions={
            bottleneckLabel === null ? undefined : (
              <Badge tone="warning" dot>
                {t("reports.bottleneckBadge", { label: bottleneckLabel })}
              </Badge>
            )
          }
        />
        <div className="px-4 py-4">
          {bottleneckItems.length === 0 ? (
            <EmptyState
              title={t("reports.bottleneckEmpty")}
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/tickets">{t("reports.openTickets")}</Link>
                </Button>
              }
            />
          ) : (
            <HBars items={[...bottleneckItems]} />
          )}
        </div>
      </Card>
      <Card className="fade-in">
        <CardHeader
          title={volumeTitle}
          subtitle={t("reports.volumeSubtitle")}
        />
        <div className="px-4 py-4">
          {serviceItems.length === 0 ? (
            <EmptyState
              title={t("reports.volumeEmpty")}
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/tickets">{t("reports.openTickets")}</Link>
                </Button>
              }
            />
          ) : (
            <HBars items={[...serviceItems]} />
          )}
        </div>
      </Card>
      <Card className="fade-in xl:col-span-2">
        <CardHeader
          title={t("reports.flowTitle")}
          subtitle={t("reports.flowSubtitle")}
        />
        <div className="grid grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[1fr_300px]">
          <GroupedBars
            data={[...volume]}
            aLabel={t("reports.flowCreated")}
            bLabel={t("reports.flowResolved")}
          />
          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
              {t("reports.agingTitle")}
            </p>
            <HBars items={[...agingItems]} />
            {waitingOverSevenDays > 0 ? (
              <p className="mt-3 border-t border-border/70 pt-3 text-[11px] leading-[18px] text-muted-foreground/70">
                {t("reports.agingWaitingHint", {
                  count: waitingOverSevenDays,
                })}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
