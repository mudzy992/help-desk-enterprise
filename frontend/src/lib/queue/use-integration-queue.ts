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

export function appendUniqueIntegrationJobs(
  current: readonly IntegrationJob[],
  incoming: readonly IntegrationJob[],
): readonly IntegrationJob[] {
  const loadedIds = new Set(current.map((job) => job.id));
  return [...current, ...incoming.filter((job) => !loadedIds.has(job.id))];
}

export function useIntegrationQueue(enabled: boolean) {
  const [status, setStatus] = useState<IntegrationJobAdminStatus>(
    integrationJobStatuses.failed,
  );
  const [jobs, setJobs] = useState<readonly IntegrationJob[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<IntegrationQueueErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setJobs([]);
      setNextCursor(null);
      setIsLoading(false);
      setIsLoadingMore(false);
      setErrorKey(null);
      setRequestId(null);
      return;
    }
    setIsLoading(true);
    setIsLoadingMore(false);
    setNextCursor(null);
    setErrorKey(null);
    setRequestId(null);
    try {
      const page = await listIntegrationJobs(status);
      setJobs(page.items);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setJobs([]);
      setErrorKey(mapIntegrationQueueError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, status]);

  const loadMore = useCallback(async () => {
    if (!enabled || nextCursor === null || isLoadingMore) return;
    setIsLoadingMore(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      const page = await listIntegrationJobs(status, nextCursor);
      setJobs((current) => appendUniqueIntegrationJobs(current, page.items));
      setNextCursor(page.nextCursor);
    } catch (error) {
      // Keep the rows already loaded so a transient failure can be retried.
      setErrorKey(mapIntegrationQueueError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoadingMore(false);
    }
  }, [enabled, isLoadingMore, nextCursor, status]);

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
    nextCursor,
    isLoading,
    isLoadingMore,
    pendingJobId,
    errorKey,
    requestId,
    loadMore,
    retryNow,
  };
}
