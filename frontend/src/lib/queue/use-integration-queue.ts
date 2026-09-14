import { useCallback, useEffect, useState } from "react";
import {
  mapIntegrationQueueError,
  type IntegrationQueueErrorKey,
} from "@/lib/queue/map-integration-queue-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  listIntegrationJobs,
  retryIntegrationJob,
  type IntegrationJob,
  type IntegrationJobAdminStatus,
} from "@/services/integration-queue-api";
import { integrationJobStatuses } from "@/services/integration-queue-types";

export function useIntegrationQueue(enabled: boolean) {
  const [status, setStatus] = useState<IntegrationJobAdminStatus>(
    integrationJobStatuses.failed,
  );
  const [jobs, setJobs] = useState<readonly IntegrationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<IntegrationQueueErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setJobs([]);
      setIsLoading(false);
      setErrorKey(null);
      setRequestId(null);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setJobs(await listIntegrationJobs(status));
    } catch (error) {
      setJobs([]);
      setErrorKey(mapIntegrationQueueError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, status]);

  const retryNow = useCallback(
    async (jobId: string) => {
      setPendingJobId(jobId);
      setErrorKey(null);
      setRequestId(null);
      try {
        await retryIntegrationJob(jobId);
        await load();
      } catch (error) {
        setErrorKey(mapIntegrationQueueError(error));
        setRequestId(readApiRequestId(error));
      } finally {
        setPendingJobId(null);
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    status,
    setStatus,
    jobs,
    isLoading,
    pendingJobId,
    errorKey,
    requestId,
    retryNow,
  };
}
