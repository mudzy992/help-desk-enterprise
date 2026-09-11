import { LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.dashboard")]}
        title={t("navigation.dashboard")}
      />
      <EmptyState
        icon={<LayoutDashboard size={18} strokeWidth={1.8} />}
        title={t("placeholders.dashboardTitle")}
        body={t("placeholders.dashboardBody")}
      />
    </section>
  );
}
