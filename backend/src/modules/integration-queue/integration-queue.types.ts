import type {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';

export type IntegrationQueueJobData = {
  readonly integrationJobId: string;
};

export type IntegrationJobProcessingClaimInput = {
  readonly id: string;
  /** Stable BullMQ job id for this logical attempt. */
  readonly attemptId: string;
  /** Unique random token for this worker invocation. */
  readonly ownerToken: string;
  readonly now: Date;
  readonly leaseExpiresAt: Date;
};

export type IntegrationJobProcessingClaim = {
  readonly id: string;
  readonly type: IntegrationJobType;
  readonly payload: unknown;
  readonly attempts: number;
  readonly version: number;
  readonly processingAttemptId: string;
  readonly processingOwnerToken: string;
  readonly processingLeaseExpiresAt: Date;
};

export type EmailIntegrationJobPayload = {
  readonly userId: string;
  readonly toAddress: string;
  readonly subject: string;
  readonly text: string;
  readonly templateKey: string;
  readonly dedupeKey: string;
  /** 1.5 additions — optional so jobs queued before the upgrade still run. */
  readonly html?: string;
  readonly replyTo?: string;
  readonly messageId?: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export type EdgeEventIntegrationJobPayload = {
  readonly userId: string;
  readonly ticketId?: string;
  readonly eventName: string;
  readonly data: unknown;
};

export type IntegrationQueueSettings = {
  readonly enabled: boolean;
  readonly typeTokens: ReadonlySet<string>;
  readonly maxAttempts: number;
  readonly initialBackoffSeconds: number;
  readonly maxBackoffSeconds: number;
  readonly deadLetterAfterAttempts: number;
  readonly deadLetterRetentionDays: number;
  readonly workerPollSeconds: number;
  readonly adminUiEnabled: boolean;
};

export const integrationJobAdminErrorCodes = {
  edgeEventNoSubscribers: 'EDGE_EVENT_NO_SUBSCRIBERS',
  processingOutcomeUnknown: 'PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN',
  providerOutcomeUnknown: 'PROVIDER_DELIVERY_OUTCOME_UNKNOWN',
  payloadLimitExceeded: 'INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED',
  genericFailure: 'INTEGRATION_JOB_FAILED',
} as const;

export type IntegrationJobAdminErrorCode =
  (typeof integrationJobAdminErrorCodes)[keyof typeof integrationJobAdminErrorCodes];

export type IntegrationJobResponse = {
  readonly id: string;
  readonly type: IntegrationJobType;
  readonly status: IntegrationJobStatus;
  readonly lastErrorCode: IntegrationJobAdminErrorCode | null;
  readonly attempts: number;
  readonly nextRetryAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type IntegrationJobPageResponse = {
  readonly items: readonly IntegrationJobResponse[];
  readonly nextCursor: string | null;
};

export type EnqueueIntegrationJobInput = {
  readonly type: IntegrationJobType;
  readonly payload:
    | EmailIntegrationJobPayload
    | EdgeEventIntegrationJobPayload
    | Record<string, unknown>;
};

export type IntegrationWorkerStatus = 'active' | 'stale' | 'unknown';

export type IntegrationWorkerStatusResponse = {
  readonly status: IntegrationWorkerStatus;
  readonly lastHeartbeatAt: string | null;
};
