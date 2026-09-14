import type {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';

export type IntegrationQueueJobData = {
  readonly integrationJobId: string;
};

export type EmailIntegrationJobPayload = {
  readonly userId: string;
  readonly toAddress: string;
  readonly subject: string;
  readonly text: string;
  readonly templateKey: string;
  readonly dedupeKey: string;
};

export type EdgeEventIntegrationJobPayload = {
  readonly userId: string;
  readonly ticketId?: string;
  readonly eventName: string;
  readonly data: unknown;
};

export type TeamsStubIntegrationJobPayload = {
  readonly eventType: string;
  readonly event: string;
  readonly ticketId: string;
  readonly messageId: string;
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

export type IntegrationJobResponse = {
  readonly id: string;
  readonly type: IntegrationJobType;
  readonly status: IntegrationJobStatus;
  readonly payload: unknown;
  readonly lastError: string | null;
  readonly attempts: number;
  readonly nextRetryAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EnqueueIntegrationJobInput = {
  readonly type: IntegrationJobType;
  readonly payload:
    | EmailIntegrationJobPayload
    | EdgeEventIntegrationJobPayload
    | TeamsStubIntegrationJobPayload
    | Record<string, unknown>;
};
