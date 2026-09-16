import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IntegrationQueueCard } from "@/components/queue/integration-queue-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { canManageIntegrationQueue } from "@/lib/queue/can-manage-integration-queue";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function IntegrationQueuePage() {
  const { t } = useTranslation();
  const { session, isLoading: sessionLoading } = useSessionCapabilities();
  const canManage =
    session !== null &&
    canManageIntegrationQueue({
      isSuperAdmin: session.isSuperAdmin,
      permissionKeys: session.permissionKeys,
    });

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.queue")]}
        title={t("integrationQueue.title")}
        subtitle={t("integrationQueue.intro")}
      />
      {sessionLoading ? (
        <PanelSkeleton label={t("integrationQueue.loading")} />
      ) : null}
      {!sessionLoading && !canManage ? (
        <EmptyState
          icon={<Database size={18} strokeWidth={1.8} />}
          title={t("integrationQueue.forbiddenTitle")}
          body={t("integrationQueue.forbiddenBody")}
        />
      ) : null}
      {!sessionLoading && canManage ? (
        <IntegrationQueueCard enabled />
      ) : null}
    </section>
  );
}
