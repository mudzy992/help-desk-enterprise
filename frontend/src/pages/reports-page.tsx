import {
  BarChart3,
  Ticket,
  TicketCheck,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  summarizeTickets,
  type DashboardSummary,
} from "@/lib/dashboard/summarize-tickets";
import { useSession } from "@/lib/session/use-session";
import {
  mapTicketError,
  type TicketErrorKey,
} from "@/lib/tickets/map-ticket-error";
import { listTickets } from "@/services/tickets-api";

export function ReportsPage() {
  const { t } = useTranslation();
  const { currentUserId } = useSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<TicketErrorKey | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const tickets = await listTickets();
      setSummary(summarizeTickets(tickets, currentUserId));
    } catch (error) {
      setSummary(null);
      setErrorKey(mapTicketError(error));
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section>
      <PageHeader
        crumbs={[
          "EP-HelpDesk",
          t("navigation.sections.overview"),
          t("navigation.reports"),
        ]}
        title={t("reports.title")}
        subtitle={t("reports.intro")}
      />
      {isLoading ? (
        <PanelSkeleton className="mt-0" label={t("reports.title")} />
      ) : errorKey ? (
        <ApiErrorText messageKey={errorKey} />
      ) : summary === null || summary.total === 0 ? (
        <EmptyState
          icon={<BarChart3 size={18} strokeWidth={1.8} />}
          title={t("reports.emptyTitle")}
          body={t("reports.emptyBody")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/tickets/new">{t("tickets.createAction")}</Link>
            </Button>
          }
        />
      ) : (
        <ReportsCountRow summary={summary} />
      )}
    </section>
  );
}

function ReportsCountRow({ summary }: { readonly summary: DashboardSummary }) {
  const { t } = useTranslation();
  const items = [
    {
      key: "total",
      to: "/tickets?view=all",
      label: t("reports.metricTotal"),
      hint: t("reports.hintTotal"),
      value: summary.total,
      icon: <Ticket size={15} strokeWidth={1.8} />,
      emphasis: false,
    },
    {
      key: "open",
      to: "/tickets?view=all",
      label: t("reports.metricOpen"),
      hint: t("reports.hintOpen"),
      value: summary.open,
      icon: <TicketCheck size={15} strokeWidth={1.8} />,
      emphasis: false,
    },
    {
      key: "overdue",
      to: "/tickets?view=all&overdue=true",
      label: t("reports.metricOverdue"),
      hint: t("reports.hintOverdue"),
      value: summary.overdue,
      icon: <TriangleAlert size={15} strokeWidth={1.8} />,
      emphasis: summary.overdue > 0,
    },
    {
      key: "unrouted",
      to: "/tickets?view=all&status=UNROUTED",
      label: t("reports.metricUnrouted"),
      hint: t("reports.hintUnrouted"),
      value: summary.unrouted,
      icon: <TriangleAlert size={15} strokeWidth={1.8} />,
      emphasis: summary.unrouted > 0,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <StatCard
            label={item.label}
            value={item.value}
            hint={item.hint}
            icon={item.icon}
            emphasis={item.emphasis}
          />
        </Link>
      ))}
    </div>
  );
}
