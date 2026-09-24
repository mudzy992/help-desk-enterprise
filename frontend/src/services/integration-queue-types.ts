export const integrationJobStatuses = {
  pending: "PENDING",
  processing: "PROCESSING",
  completed: "COMPLETED",
  failed: "FAILED",
  dlq: "DLQ",
} as const;

export type IntegrationJobAdminStatus =
  (typeof integrationJobStatuses)[keyof typeof integrationJobStatuses];

export const integrationJobAdminStatuses: readonly IntegrationJobAdminStatus[] = [
  integrationJobStatuses.pending,
  integrationJobStatuses.processing,
  integrationJobStatuses.completed,
  integrationJobStatuses.failed,
  integrationJobStatuses.dlq,
];

export const retryableIntegrationJobStatuses: readonly IntegrationJobAdminStatus[] = [
  integrationJobStatuses.failed,
  integrationJobStatuses.dlq,
];

export type IntegrationJobType = "EMAIL" | "EDGE_EVENT" | "TEAMS_STUB";

export type IntegrationJob = {
  readonly id: string;
  readonly type: IntegrationJobType;
  readonly status: IntegrationJobAdminStatus;
  readonly payload: unknown;
  readonly lastError: string | null;
  readonly attempts: number;
  readonly nextRetryAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type IntegrationWorkerStatus = "active" | "stale" | "unknown";

export type IntegrationWorkerStatusResponse = {
  readonly status: IntegrationWorkerStatus;
  readonly lastHeartbeatAt: string | null;
};
