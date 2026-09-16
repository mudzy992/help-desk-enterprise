import { apiRequest } from "@/services/api";
import type {
  IntegrationJob,
  IntegrationJobAdminStatus,
  IntegrationWorkerStatusResponse,
} from "@/services/integration-queue-types";

export type {
  IntegrationJob,
  IntegrationJobAdminStatus,
  IntegrationWorkerStatus,
  IntegrationWorkerStatusResponse,
} from "@/services/integration-queue-types";

export function listIntegrationJobs(
  status: IntegrationJobAdminStatus,
): Promise<readonly IntegrationJob[]> {
  return apiRequest(`/integration-jobs?status=${encodeURIComponent(status)}`);
}

export function retryIntegrationJob(jobId: string): Promise<IntegrationJob> {
  return apiRequest(`/integration-jobs/${jobId}/retry`, { method: "POST" });
}

export function getIntegrationWorkerStatus(): Promise<IntegrationWorkerStatusResponse> {
  return apiRequest("/integration-jobs/worker-status");
}
