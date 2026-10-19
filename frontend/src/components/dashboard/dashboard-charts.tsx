import { useTranslation } from "react-i18next";
import { Donut } from "@/components/charts/donut";
import { DualAreaChart } from "@/components/charts/dual-area-chart";
import { Card, CardHeader } from "@/components/ui/card";
import type { DashboardSummary } from "@/lib/dashboard/compose-dashboard-summary";
import { formatDashboardDayLabel } from "@/lib/dashboard/format-dashboard-day-label";
import { TICKET_STATUS_META } from "@/lib/theme/semantic-meta";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";

interface DashboardChartsProperties {
  readonly summary: DashboardSummary;
}

export function DashboardCharts({ summary }: DashboardChartsProperties) {
  const { t, i18n } = useTranslation();

  // Val 6.1 / modul 4 (D15): the page-level EmptyState already renders for
  // `summary.total === 0`, so the inner check was unreachable.
  // Val 6.1 / modul 4 (D16): typed `t()` with explicit `TicketStatusLabelKey`
  // union replaces the untyped `ticketText` escape hatch (T4).
  const donutData = summary.statusCounts.map((entry) => ({
    label: t(ticketStatusLabelKey[entry.status]),
    value: entry.count,
    color: TICKET_STATUS_META[entry.status].dot,
  }));

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <Card className="fade-in">
        <CardHeader
          title={t("dashboard.statusChartTitle")}
          subtitle={t("dashboard.statusChartSubtitle")}
        />
        <div className="px-4 py-4">
          <Donut data={donutData} centerLabel={t("dashboard.statusChartCenter")} />
        </div>
      </Card>
      <Card className="fade-in xl:col-span-2">
        <CardHeader
          title={t("dashboard.volumeChartTitle")}
          subtitle={t("dashboard.volumeChartSubtitle")}
        />
        <div className="px-4 py-4">
          <DualAreaChart
            data={summary.volume14d.map((day) => ({
              label: formatDashboardDayLabel(new Date(`${day.date}T12:00:00`), i18n.language),
              a: day.created,
              b: day.resolved,
            }))}
            aLabel={t("dashboard.volumeCreated")}
            bLabel={t("dashboard.volumeResolved")}
          />
        </div>
      </Card>
    </div>
  );
}
