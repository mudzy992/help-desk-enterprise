import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IntegrationQueueTable } from "@/components/queue/integration-queue-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { errorTextClassName } from "@/components/ui/control";
import { useIntegrationQueue } from "@/lib/queue/use-integration-queue";
import { useIntegrationWorkerStatus } from "@/lib/queue/use-integration-worker-status";
import {
  integrationJobAdminStatuses,
} from "@/services/integration-queue-types";
import type { IntegrationWorkerStatus } from "@/services/integration-queue-types";

const workerBadgeTone: Record<IntegrationWorkerStatus, BadgeTone> = {
  active: "primary",
  stale: "danger",
  unknown: "neutral",
};

const workerBadgeKey = {
  active: "integrationQueue.workerActive",
  stale: "integrationQueue.workerStale",
  unknown: "integrationQueue.workerUnknown",
} as const;

export function IntegrationQueueCard({
  enabled,
}: {
  readonly enabled: boolean;
}) {
  const { t } = useTranslation();
  const queue = useIntegrationQueue(enabled);
  const workerStatus = useIntegrationWorkerStatus(enabled);

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("integrationQueue.heading")}
        subtitle={t("integrationQueue.headingHint")}
        actions={
          <Badge tone={workerBadgeTone[workerStatus]} dot>
            {t(workerBadgeKey[workerStatus])}
          </Badge>
        }
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
