import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { canRetryIntegrationJob } from "@/lib/queue/can-retry-integration-job";
import { integrationJobBadgeTone } from "@/lib/queue/integration-job-badge-tone";
import { truncateQueueError } from "@/lib/queue/truncate-queue-error";
import type { IntegrationJob } from "@/services/integration-queue-types";

interface IntegrationQueueTableProperties {
  readonly jobs: readonly IntegrationJob[];
  readonly pendingJobId: string | null;
  readonly canRetry: boolean;
  readonly onRetry: (jobId: string) => void;
}

export function IntegrationQueueTable({
  jobs,
  pendingJobId,
  canRetry,
  onRetry,
}: IntegrationQueueTableProperties) {
  const { t, i18n } = useTranslation();

  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
          <tr>
            <th className="px-3 py-2">{t("integrationQueue.columnType")}</th>
            <th className="px-3 py-2">{t("integrationQueue.columnStatus")}</th>
            <th className="px-3 py-2">{t("integrationQueue.columnAttempts")}</th>
            <th className="px-3 py-2">{t("integrationQueue.columnError")}</th>
            <th className="px-3 py-2">{t("integrationQueue.columnUpdated")}</th>
            <th className="px-3 py-2">{t("integrationQueue.columnActions")}</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className={tableRowClassName}>
              <td className="px-3">{t(`integrationQueue.types.${job.type}`)}</td>
              <td className="px-3">
                <Badge tone={integrationJobBadgeTone(job.status)}>
                  {t(`integrationQueue.statuses.${job.status}`)}
                </Badge>
              </td>
              <td className="tnum px-3">{job.attempts}</td>
              <td className="max-w-[280px] truncate px-3 text-[12px] text-muted-foreground">
                {truncateQueueError(job.lastError) || t("integrationQueue.noError")}
              </td>
              <td className="px-3">
                <RelativeTime value={job.updatedAt} locale={i18n.language} />
              </td>
              <td className="px-3">
                {canRetry && canRetryIntegrationJob(job.status) ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={pendingJobId === job.id}
                    onClick={() => onRetry(job.id)}
                  >
                    {pendingJobId === job.id
                      ? t("integrationQueue.retrying")
                      : t("integrationQueue.retryNow")}
                  </Button>
                ) : (
                  <span className="text-[12px] text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
