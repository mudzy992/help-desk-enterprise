import { ArrowUpRight, LayoutDashboard, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardActivityFeed } from "@/components/dashboard/dashboard-activity-feed";
import { DashboardAttentionTable } from "@/components/dashboard/dashboard-attention-table";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DashboardInboxSnapshot } from "@/components/dashboard/dashboard-inbox-snapshot";
import { DashboardMetricGrid } from "@/components/dashboard/dashboard-metric-grid";
import { DashboardRecentTickets } from "@/components/dashboard/dashboard-recent-tickets";
import { DashboardSlaWatchlist } from "@/components/dashboard/dashboard-sla-watchlist";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { recentTicketsExcluding } from "@/lib/dashboard/dashboard-ticket-sets";
import { useDashboardSummary } from "@/lib/dashboard/use-dashboard-summary";

export function DashboardPage() {
  const { t } = useTranslation();
  const {
    summary,
    inboxCount,
    inboxTickets,
    serviceNames,
    originNames,
    groupNames,
    isLoading,
    errorKey,
    requestId,
  } = useDashboardSummary();
  const recentExclusive =
    summary === null
      ? []
      : recentTicketsExcluding(summary.recent, summary.attention);

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.dashboard")]}
        title={t("navigation.dashboard")}
        subtitle={t("dashboard.intro")}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              aria-disabled
              title={t("dashboard.reportsActionDisabledHint")}
            >
              <ArrowUpRight size={14} /> {t("dashboard.reportsAction")}
            </Button>
            <Button asChild size="sm">
              <Link to="/tickets/new">
                <Plus size={14} /> {t("tickets.createAction")}
              </Link>
            </Button>
          </>
        }
      />
      {isLoading ? (
        <PanelSkeleton className="mt-0" label={t("navigation.dashboard")} />
      ) : errorKey ? (
        <ApiErrorText messageKey={errorKey} requestId={requestId} />
      ) : summary === null || summary.total === 0 ? (
        <EmptyState
          icon={<LayoutDashboard size={18} strokeWidth={1.8} />}
          title={t("dashboard.emptyTitle")}
          body={t("dashboard.emptyBody")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/tickets/new">{t("tickets.createAction")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          <DashboardMetricGrid summary={summary} inboxCount={inboxCount} />
          <DashboardCharts summary={summary} />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <DashboardSlaWatchlist items={summary.slaWatchlist} />
            <DashboardInboxSnapshot
              unroutedCount={summary.unrouted}
              inboxTickets={inboxTickets}
              groupNames={groupNames}
            />
            <DashboardActivityFeed />
          </div>
          <DashboardAttentionTable
            items={summary.attention}
            serviceNames={serviceNames}
            originNames={originNames}
          />
          {recentExclusive.length > 0 ? (
            <Card>
              <CardHeader
                title={t("dashboard.recentHeading")}
                subtitle={t("dashboard.recentHint")}
                actions={
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/tickets?view=all">{t("dashboard.viewAll")}</Link>
                  </Button>
                }
              />
              <div className="px-1 py-1.5">
                <DashboardRecentTickets items={recentExclusive} />
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </section>
  );
}
