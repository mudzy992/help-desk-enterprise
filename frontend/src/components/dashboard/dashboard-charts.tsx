import { PieChart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Donut } from "@/components/charts/donut";
import { DualAreaChart } from "@/components/charts/dual-area-chart";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { DashboardSummary } from "@/lib/dashboard/compose-dashboard-summary";
import { TICKET_STATUS_META } from "@/lib/theme/semantic-meta";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";

interface DashboardChartsProperties {
  readonly summary: DashboardSummary;
}

export function DashboardCharts({ summary }: DashboardChartsProperties) {
  const { t } = useTranslation();

  if (summary.total === 0) {
    return (
      <EmptyState
        icon={<PieChart size={18} strokeWidth={1.8} />}
        title={t("dashboard.chartsEmptyTitle")}
        body={t("dashboard.chartsEmptyBody")}
      />
    );
  }

  const donutData = summary.statusCounts.map((entry) => ({
    label: ticketText(t, ticketStatusLabelKey[entry.status]),
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
              label: day.d,
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
