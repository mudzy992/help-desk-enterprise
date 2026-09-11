import { LayoutDashboard, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardMetricGrid } from "@/components/dashboard/dashboard-metric-grid";
import { DashboardRecentTickets } from "@/components/dashboard/dashboard-recent-tickets";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useDashboardSummary } from "@/lib/dashboard/use-dashboard-summary";

export function DashboardPage() {
  const { t } = useTranslation();
  const { summary, inboxCount, isLoading, errorKey } = useDashboardSummary();

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.dashboard")]}
        title={t("navigation.dashboard")}
        subtitle={t("dashboard.intro")}
        actions={
          <Button asChild size="sm">
            <Link to="/tickets/new">
              <Plus size={14} /> {t("tickets.createAction")}
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <PanelSkeleton className="mt-0" label={t("navigation.dashboard")} />
      ) : errorKey ? (
        <ApiErrorText messageKey={errorKey} />
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
              <DashboardRecentTickets items={summary.recent} />
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
