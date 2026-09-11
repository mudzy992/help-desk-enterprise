import {
  AlarmClock,
  Inbox,
  ShieldAlert,
  Ticket,
  TicketCheck,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StatCard } from "@/components/ui/stat-card";
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

type MetricHintKey =
  | "dashboard.hintInbox"
  | "dashboard.hintOpen"
  | "dashboard.hintAssigned"
  | "dashboard.hintUnassigned"
  | "dashboard.hintWaiting"
  | "dashboard.hintApproval"
  | "dashboard.hintUnrouted"
  | "dashboard.hintRequested";

type Metric = {
  readonly labelKey: MetricLabelKey;
  readonly hintKey: MetricHintKey;
  readonly value: number;
  readonly to: string;
  readonly icon: ReactNode;
  readonly emphasis?: boolean;
};

export function DashboardMetricGrid({
  summary,
  inboxCount,
}: DashboardMetricGridProperties) {
  const { t } = useTranslation();
  const inboxMetric: Metric = {
    labelKey: "dashboard.metricInbox",
    hintKey: "dashboard.hintInbox",
    value: inboxCount ?? 0,
    to: "/tickets?view=inbox",
    icon: <Inbox size={15} strokeWidth={1.8} />,
  };
  const metrics: readonly Metric[] = [
    ...(inboxCount === null ? [] : [inboxMetric]),
    {
      labelKey: "dashboard.metricOpen",
      hintKey: "dashboard.hintOpen",
      value: summary.open,
      to: "/tickets?view=all",
      icon: <TicketCheck size={15} strokeWidth={1.8} />,
    },
    {
      labelKey: "dashboard.metricAssignedToMe",
      hintKey: "dashboard.hintAssigned",
      value: summary.assignedToMe,
      to: "/tickets?view=assigned",
      icon: <UserPlus size={15} strokeWidth={1.8} />,
    },
    {
      labelKey: "dashboard.metricUnassigned",
      hintKey: "dashboard.hintUnassigned",
      value: summary.unassigned,
      to: "/tickets?view=unassigned",
      icon: <Users size={15} strokeWidth={1.8} />,
    },
    {
      labelKey: "dashboard.metricWaitingForUser",
      hintKey: "dashboard.hintWaiting",
      value: summary.waitingForUser,
      to: "/tickets?view=all",
      icon: <AlarmClock size={15} strokeWidth={1.8} />,
    },
    {
      labelKey: "dashboard.metricPendingApproval",
      hintKey: "dashboard.hintApproval",
      value: summary.pendingApproval,
      to: "/tickets?view=all",
      icon: <ShieldAlert size={15} strokeWidth={1.8} />,
    },
    {
      labelKey: "dashboard.metricUnrouted",
      hintKey: "dashboard.hintUnrouted",
      value: summary.unrouted,
      to: "/tickets?view=all",
      icon: <TriangleAlert size={15} strokeWidth={1.8} />,
      emphasis: summary.unrouted > 0,
    },
    {
      labelKey: "dashboard.metricRequestedByMe",
      hintKey: "dashboard.hintRequested",
      value: summary.requestedByMe,
      to: "/tickets?view=requested",
      icon: <Ticket size={15} strokeWidth={1.8} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Link
          key={metric.labelKey}
          to={metric.to}
          className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <StatCard
            label={t(metric.labelKey)}
            value={metric.value}
            hint={t(metric.hintKey)}
            icon={metric.icon}
            emphasis={metric.emphasis}
          />
        </Link>
      ))}
    </div>
  );
}
