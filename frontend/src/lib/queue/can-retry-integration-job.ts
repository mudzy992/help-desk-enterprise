import {
  retryableIntegrationJobStatuses,
  type IntegrationJobAdminStatus,
} from "@/services/integration-queue-types";

export function canRetryIntegrationJob(status: IntegrationJobAdminStatus): boolean {
  return retryableIntegrationJobStatuses.includes(status);
}
