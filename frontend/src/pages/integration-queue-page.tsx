import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IntegrationQueueTable } from "@/components/queue/integration-queue-table";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { errorTextClassName } from "@/components/ui/control";
import { canManageIntegrationQueue } from "@/lib/queue/can-manage-integration-queue";
import { useIntegrationQueue } from "@/lib/queue/use-integration-queue";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { integrationJobAdminStatuses } from "@/services/integration-queue-types";

export function IntegrationQueuePage() {
  const { t } = useTranslation();
  const { session, isLoading: sessionLoading } = useSessionCapabilities();
  const canManage =
    session !== null &&
    canManageIntegrationQueue({
      isSuperAdmin: session.isSuperAdmin,
      permissionKeys: session.permissionKeys,
    });
  const queue = useIntegrationQueue(!sessionLoading && canManage);

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
        <QueueWorkspace queue={queue} />
      ) : null}
    </section>
  );
}

function QueueWorkspace({
  queue,
}: {
  readonly queue: ReturnType<typeof useIntegrationQueue>;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader
        title={t("integrationQueue.heading")}
        subtitle={t("integrationQueue.headingHint")}
      />
      <div className="px-4 py-3.5">
        <UnderlineTabs
          className="mb-4"
          active={queue.status}
          onChange={(key) =>
            queue.setStatus(key as (typeof integrationJobAdminStatuses)[number])
          }
          items={integrationJobAdminStatuses.map((status) => ({
            key: status,
            label: t(`integrationQueue.statuses.${status}`),
          }))}
        />
        {queue.errorKey ? (
          <p className={`${errorTextClassName} mb-3`} role="alert">
            {t(queue.errorKey)}
            {queue.requestId ? (
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                {t("errors.requestId", { requestId: queue.requestId })}
              </span>
            ) : null}
          </p>
        ) : null}
        {queue.isLoading ? (
          <PanelSkeleton className="mt-0" label={t("integrationQueue.loading")} />
        ) : queue.jobs.length === 0 ? (
          <EmptyState
            icon={<Database size={18} strokeWidth={1.8} />}
            title={t("integrationQueue.emptyTitle")}
            body={t("integrationQueue.emptyBody")}
          />
        ) : (
          <IntegrationQueueTable
            jobs={queue.jobs}
            pendingJobId={queue.pendingJobId}
            canRetry
            onRetry={(jobId) => void queue.retryNow(jobId)}
          />
        )}
      </div>
    </Card>
  );
}
