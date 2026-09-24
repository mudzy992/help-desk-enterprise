import {
  AlarmClock,
  Flame,
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
import type { BadgeTone } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardSummary } from "@/lib/dashboard/compose-dashboard-summary";

interface DashboardMetricGridProperties {
  readonly summary: DashboardSummary;
  readonly inboxCount: number | null;
  readonly isStaff: boolean;
}

type MetricLabelKey =
  | "dashboard.metricInbox"
  | "dashboard.metricOpen"
  | "dashboard.metricCritical"
  | "dashboard.metricOverdue"
  | "dashboard.metricAssignedToMe"
  | "dashboard.metricUnassigned"
  | "dashboard.metricWaitingForUser"
  | "dashboard.metricPendingApproval"
  | "dashboard.metricUnrouted"
  | "dashboard.metricRequestedByMe";

type MetricHintKey =
  | "dashboard.hintInbox"
  | "dashboard.hintOpen"
  | "dashboard.hintCritical"
  | "dashboard.hintOverdue"
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
  readonly delta?: string;
  readonly deltaTone?: BadgeTone;
};

// Queue-handling metrics (assigned, unassigned, unrouted, approvals, inbox) are
// meaningless for a requester, who only tracks their own tickets.
const requesterMetricLabelKeys: readonly MetricLabelKey[] = [
  "dashboard.metricOpen",
  "dashboard.metricWaitingForUser",
  "dashboard.metricRequestedByMe",
];

export function DashboardMetricGrid({
  summary,
  inboxCount,
  isStaff,
}: DashboardMetricGridProperties) {
  const { t } = useTranslation();
  const openedTodayDelta =
    summary.openedToday > 0
      ? t("dashboard.deltaOpenedToday", { count: summary.openedToday })
      : undefined;
  const metrics = buildDashboardMetrics(summary, inboxCount, openedTodayDelta).filter(
    (metric) => isStaff || requesterMetricLabelKeys.includes(metric.labelKey),
  );

  return (
    <div className="fade-in grid grid-cols-2 gap-3 xl:grid-cols-4">
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
            delta={metric.delta}
            deltaTone={metric.deltaTone}
          />
        </Link>
      ))}
    </div>
  );
}

function buildDashboardMetrics(
  summary: DashboardSummary,
  inboxCount: number | null,
  openedTodayDelta: string | undefined,
): readonly Metric[] {
  const inbox: Metric | null =
    inboxCount === null
      ? null
      : {
          labelKey: "dashboard.metricInbox",
          hintKey: "dashboard.hintInbox",
          value: inboxCount,
          to: "/tickets?view=inbox",
          icon: <Inbox size={15} strokeWidth={1.8} />,
        };
  const unrouted: Metric = {
    labelKey: "dashboard.metricUnrouted",
    hintKey: "dashboard.hintUnrouted",
    value: summary.unrouted,
    to: "/tickets?view=all&status=UNROUTED",
    icon: <TriangleAlert size={15} strokeWidth={1.8} />,
    emphasis: summary.unrouted > 0,
  };
  return [
    {
      labelKey: "dashboard.metricOpen",
      hintKey: "dashboard.hintOpen",
      value: summary.open,
      to: "/tickets?view=all",
      icon: <TicketCheck size={15} strokeWidth={1.8} />,
      delta: openedTodayDelta,
      deltaTone: "info",
    },
    {
      labelKey: "dashboard.metricCritical",
      hintKey: "dashboard.hintCritical",
      value: summary.critical,
      to: "/tickets?view=all&priority=CRITICAL",
      icon: <Flame size={15} strokeWidth={1.8} />,
      emphasis: summary.critical > 0,
    },
    {
      labelKey: "dashboard.metricOverdue",
      hintKey: "dashboard.hintOverdue",
      value: summary.overdue,
      to: "/tickets?view=all&overdue=true",
      icon: <TriangleAlert size={15} strokeWidth={1.8} />,
      emphasis: summary.overdue > 0,
    },
    inbox ?? unrouted,
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
      to: "/tickets?view=all&status=WAITING_FOR_USER",
      icon: <AlarmClock size={15} strokeWidth={1.8} />,
    },
    {
      labelKey: "dashboard.metricPendingApproval",
      hintKey: "dashboard.hintApproval",
      value: summary.pendingApproval,
      to: "/tickets?view=all&status=PENDING_APPROVAL",
      icon: <ShieldAlert size={15} strokeWidth={1.8} />,
    },
    ...(inbox ? [unrouted] : []),
    {
      labelKey: "dashboard.metricRequestedByMe",
      hintKey: "dashboard.hintRequested",
      value: summary.requestedByMe,
      to: "/tickets?view=requested",
      icon: <Ticket size={15} strokeWidth={1.8} />,
    },
  ];
}
