import { apiRequest } from "@/services/api";
import type {
  IntegrationJob,
  IntegrationJobAdminStatus,
  IntegrationJobListResult,
  IntegrationWorkerStatusResponse,
} from "@/services/integration-queue-types";

export type {
  IntegrationJob,
  IntegrationJobAdminStatus,
  IntegrationJobListResult,
  IntegrationWorkerStatus,
  IntegrationWorkerStatusResponse,
} from "@/services/integration-queue-types";

export function listIntegrationJobs(
  status: IntegrationJobAdminStatus,
  cursor?: string | null,
): Promise<IntegrationJobListResult> {
  const query = new URLSearchParams({ status });
  if (cursor != null && cursor.length > 0) query.set("cursor", cursor);
  return apiRequest(`/integration-jobs?${query.toString()}`);
}

export function retryIntegrationJob(jobId: string): Promise<IntegrationJob> {
  return apiRequest(`/integration-jobs/${jobId}/retry`, { method: "POST" });
}

export function getIntegrationWorkerStatus(): Promise<IntegrationWorkerStatusResponse> {
  return apiRequest("/integration-jobs/worker-status");
}
