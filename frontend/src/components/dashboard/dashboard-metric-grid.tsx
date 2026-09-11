import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import type { DashboardSummary } from "@/lib/dashboard/summarize-tickets";

interface DashboardMetricGridProperties {
  readonly summary: DashboardSummary;
  readonly inboxCount: number | null;
}

type MetricLabelKey =
  | "dashboard.metricInbox"
  | "dashboard.metricOpen"
  | "dashboard.metricAssignedToMe"
  | "dashboard.metricUnassigned"
  | "dashboard.metricWaitingForUser"
  | "dashboard.metricPendingApproval"
  | "dashboard.metricUnrouted"
  | "dashboard.metricRequestedByMe";

type Metric = {
  readonly labelKey: MetricLabelKey;
  readonly value: number;
  readonly to: string;
  readonly emphasis?: boolean;
};

export function DashboardMetricGrid({
  summary,
  inboxCount,
}: DashboardMetricGridProperties) {
  const { t } = useTranslation();
  const inboxMetric: Metric = {
    labelKey: "dashboard.metricInbox",
    value: inboxCount ?? 0,
    to: "/tickets?view=inbox",
  };
  const metrics: readonly Metric[] = [
    // The group inbox is permission-scoped, so it is omitted without access.
    ...(inboxCount === null ? [] : [inboxMetric]),
    {
      labelKey: "dashboard.metricOpen",
      value: summary.open,
      to: "/tickets?view=all",
    },
    {
      labelKey: "dashboard.metricAssignedToMe",
      value: summary.assignedToMe,
      to: "/tickets?view=assigned",
    },
    {
      labelKey: "dashboard.metricUnassigned",
      value: summary.unassigned,
      to: "/tickets?view=unassigned",
    },
    {
      labelKey: "dashboard.metricWaitingForUser",
      value: summary.waitingForUser,
      to: "/tickets?view=all",
    },
    {
      labelKey: "dashboard.metricPendingApproval",
      value: summary.pendingApproval,
      to: "/tickets?view=all",
    },
    {
      labelKey: "dashboard.metricUnrouted",
      value: summary.unrouted,
      to: "/tickets?view=all",
      emphasis: summary.unrouted > 0,
    },
    {
      labelKey: "dashboard.metricRequestedByMe",
      value: summary.requestedByMe,
      to: "/tickets?view=requested",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Link
          key={metric.labelKey}
          to={metric.to}
          className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Card className="h-full px-4 py-3.5 hover:border-[#31405C]">
            <p className="text-[11.5px] uppercase tracking-[0.08em] text-muted-foreground/80">
              {t(metric.labelKey)}
            </p>
            <p
              className={`tnum mt-1 text-[22px] font-semibold leading-7 ${
                metric.emphasis === true ? "text-danger" : "text-foreground"
              }`}
            >
              {metric.value}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
