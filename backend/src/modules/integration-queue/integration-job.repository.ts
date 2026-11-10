import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  markNotificationEmailDeliveryDead,
  resetNotificationEmailDeliveryForAdminRetry,
  scheduleNotificationEmailDeliveryRetry,
} from '../notifications/email/persist-notification-email-delivery';
import { parseEmailIntegrationJobPayload } from './parse-email-integration-job-payload';
import {
  integrationJobDlqRetentionBatchSize,
  integrationJobProcessingLeaseDurationMilliseconds,
  integrationJobProcessingOutcomeUnknown,
  integrationJobProviderOutcomeUnknown,
  integrationQueueAdminPageSize,
  integrationQueueAdminStatuses,
} from './integration-queue.constants';
import type {
  IntegrationJobProcessingClaim,
  IntegrationJobProcessingClaimInput,
} from './integration-queue.types';
import { resolveIntegrationJobAdminErrorCode } from './to-integration-job-response';

@Injectable()
export class IntegrationJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  createPending(input: {
    readonly type: IntegrationJobType;
    readonly payload: Prisma.InputJsonValue;
  }) {
    return this.prisma.integrationJob.create({
      data: {
        type: input.type,
        status: IntegrationJobStatus.PENDING,
        payload: input.payload,
      },
    });
  }

  findById(id: string) {
    return this.prisma.integrationJob.findUnique({ where: { id } });
  }

  listDispatchablePage(now: Date, take: number) {
    return this.prisma.integrationJob.findMany({
      where: {
        OR: [
          { status: IntegrationJobStatus.PENDING },
          {
            status: IntegrationJobStatus.FAILED,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true, type: true, status: true, attempts: true },
    });
  }

  /** Oldest currently dispatchable job creation time, not proof of processing health. */
  findOldestDispatchable(now: Date) {
    return this.prisma.integrationJob.findFirst({
      where: {
        OR: [
          { status: IntegrationJobStatus.PENDING },
          { status: IntegrationJobStatus.FAILED, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { createdAt: true },
    });
  }

  /** Select only bounded stale claims; null leases are legacy rows. */
  listExpiredProcessingPage(now: Date, take: number) {
    return this.prisma.integrationJob.findMany({
      where: {
        status: IntegrationJobStatus.PROCESSING,
        OR: [
          { processingLeaseExpiresAt: { lte: now } },
          {
            processingLeaseExpiresAt: null,
            updatedAt: { lte: new Date(now.getTime() - integrationJobProcessingLeaseDurationMilliseconds) },
          },
        ],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true, version: true, attempts: true, processingAttemptId: true, processingOwnerToken: true, processingLeaseExpiresAt: true, updatedAt: true },
    });
  }

  /** Quarantine, never replay: a live or crashed worker may have sent already. */
  async quarantineExpiredProcessing(
    job: { readonly id: string; readonly version: number; readonly attempts: number; readonly processingAttemptId: string | null; readonly processingOwnerToken: string | null; readonly processingLeaseExpiresAt: Date | null; readonly updatedAt: Date },
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.integrationJob.updateMany({
      where: {
        id: job.id,
        status: IntegrationJobStatus.PROCESSING,
        version: job.version,
        attempts: job.attempts,
        processingAttemptId: job.processingAttemptId,
        processingOwnerToken: job.processingOwnerToken,
        updatedAt: job.processingLeaseExpiresAt === null
          ? { equals: job.updatedAt, lte: new Date(now.getTime() - integrationJobProcessingLeaseDurationMilliseconds) }
          : job.updatedAt,
        processingLeaseExpiresAt: job.processingLeaseExpiresAt === null
          ? null
          : { equals: job.processingLeaseExpiresAt, lte: now },
      },
      data: {
        status: IntegrationJobStatus.DLQ,
        lastError: integrationJobProcessingOutcomeUnknown,
        nextRetryAt: null,
        version: { increment: 1 },
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async listByStatusPage(
    status: IntegrationJobStatus,
    cursor: string | null,
  ) {
    if (!integrationQueueAdminStatuses.includes(status)) {
      return { items: [], nextCursor: null } as const;
    }
    const rows = await this.prisma.integrationJob.findMany({
      where: { status },
      // The admin list reads only operational metadata; job payloads remain internal.
      select: {
        id: true,
        type: true,
        status: true,
        lastError: true,
        attempts: true,
        nextRetryAt: true,
        createdAt: true,
        updatedAt: true,
      },
      // `id` breaks ties when jobs share a timestamp, keeping page boundaries stable.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: integrationQueueAdminPageSize + 1,
      ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    const hasMore = rows.length > integrationQueueAdminPageSize;
    const items = rows.slice(0, integrationQueueAdminPageSize);
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async claimForProcessing(
    input: IntegrationJobProcessingClaimInput,
  ): Promise<IntegrationJobProcessingClaim | null> {
    if (
      input.attemptId.length === 0 ||
      input.ownerToken.length === 0 ||
      input.leaseExpiresAt.getTime() <= input.now.getTime()
    ) {
      throw new Error('invalid integration job processing claim');
    }

    const existing = await this.findById(input.id);
    if (
      existing === null ||
      (existing.status !== IntegrationJobStatus.PENDING &&
        existing.status !== IntegrationJobStatus.FAILED)
    ) {
      return null;
    }
    if (
      existing.status === IntegrationJobStatus.FAILED &&
      existing.nextRetryAt !== null &&
      existing.nextRetryAt.getTime() > input.now.getTime()
    ) {
      return null;
    }

    const expectedAttemptId =
      existing.status === IntegrationJobStatus.PENDING
        ? existing.id
        : `${existing.id}:${existing.attempts}`;
    if (input.attemptId !== expectedAttemptId) return null;

    // A single conditional update wins the status/version/retry-time CAS. A
    // second Bull delivery that observed the same row gets count=0 and never
    // reaches a provider. `version` also fences old completion/failure writers.
    const claimed = await this.prisma.integrationJob.updateMany({
      where: {
        id: existing.id,
        status: existing.status,
        version: existing.version,
        attempts: existing.attempts,
        nextRetryAt: existing.nextRetryAt,
      },
      data: {
        status: IntegrationJobStatus.PROCESSING,
        attempts: { increment: 1 },
        version: { increment: 1 },
        processingAttemptId: input.attemptId,
        processingOwnerToken: input.ownerToken,
        processingLeaseExpiresAt: input.leaseExpiresAt,
      },
    });
    if (claimed.count !== 1) return null;

    return {
      id: existing.id,
      type: existing.type,
      payload: existing.payload,
      attempts: existing.attempts + 1,
      version: existing.version + 1,
      processingAttemptId: input.attemptId,
      processingOwnerToken: input.ownerToken,
      processingLeaseExpiresAt: input.leaseExpiresAt,
    };
  }

  markCompleted(claim: IntegrationJobProcessingClaim): Promise<boolean> {
    return this.transitionClaim(claim, {
      status: IntegrationJobStatus.COMPLETED,
      lastError: null,
      nextRetryAt: null,
    });
  }

  markPublishedBestEffort(
    claim: IntegrationJobProcessingClaim,
  ): Promise<boolean> {
    if (claim.type !== IntegrationJobType.EDGE_EVENT) {
      throw new Error('PUBLISHED_BEST_EFFORT is only valid for EDGE_EVENT jobs');
    }
    return this.transitionClaim(claim, {
      status: IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
      lastError: null,
      nextRetryAt: null,
    });
  }

  markFailed(
    claim: IntegrationJobProcessingClaim,
    lastError: string,
    nextRetryAt: Date,
  ): Promise<boolean> {
    return this.transitionClaim(claim, {
      status: IntegrationJobStatus.FAILED,
      lastError,
      nextRetryAt,
    });
  }

  markDeadLetter(
    claim: IntegrationJobProcessingClaim,
    lastError: string,
  ): Promise<boolean> {
    return this.transitionClaim(claim, {
      status: IntegrationJobStatus.DLQ,
      lastError,
      nextRetryAt: null,
    });
  }

  private async transitionClaim(
    claim: IntegrationJobProcessingClaim,
    data: {
      readonly status: IntegrationJobStatus;
      readonly lastError: string | null;
      readonly nextRetryAt: Date | null;
    },
  ): Promise<boolean> {
    const updated = await this.prisma.integrationJob.updateMany({
      where: {
        id: claim.id,
        status: IntegrationJobStatus.PROCESSING,
        version: claim.version,
        attempts: claim.attempts,
        processingAttemptId: claim.processingAttemptId,
        processingOwnerToken: claim.processingOwnerToken,
        processingLeaseExpiresAt: claim.processingLeaseExpiresAt,
      },
      data: {
        ...data,
        version: { increment: 1 },
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      },
    });
    return updated.count === 1;
  }

  async resetForAdminRetry(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.integrationJob.findUnique({
        where: { id },
      });
      if (
        existing === null ||
        existing.lastError === integrationJobProcessingOutcomeUnknown ||
        existing.lastError === integrationJobProviderOutcomeUnknown ||
        (existing.status !== IntegrationJobStatus.FAILED &&
          existing.status !== IntegrationJobStatus.DLQ)
      ) {
        return null;
      }

      const updated = await transaction.integrationJob.updateMany({
        where: {
          id,
          status: existing.status,
          version: existing.version,
          attempts: existing.attempts,
          nextRetryAt: existing.nextRetryAt,
        },
        data: {
          status: IntegrationJobStatus.PENDING,
          attempts: 0,
          lastError: null,
          nextRetryAt: null,
          version: { increment: 1 },
          processingAttemptId: null,
          processingOwnerToken: null,
          processingLeaseExpiresAt: null,
        },
      });
      if (updated.count !== 1) return null;

      if (existing.type === IntegrationJobType.EMAIL) {
        const email = parseEmailIntegrationJobPayload(existing.payload);
        if (email !== null) {
          await resetNotificationEmailDeliveryForAdminRetry(
            transaction as unknown as PrismaService,
            { userId: email.userId, dedupeKey: email.dedupeKey },
          );
        }
      }

      // The reset above erases the in-row forensic trace (attempts and the
      // last error). Preserve a safe, durable copy in the hash-chained audit
      // entry committed by this same transaction: only the stable admin
      // error code is stored, never the raw provider message. Counting the
      // prior retry entries keeps a cumulative admin-retry history even
      // though the row itself restarts its attempt counter.
      const previousAdminRetries = await transaction.auditLog.count({
        where: {
          action: auditLogActions.integrationJobRetried,
          entityType: auditLogEntityTypes.integrationJob,
          entityId: id,
        },
      });

      await recordAuditEntry(
        transaction as unknown as AuditLogTransactionalClient,
        {
          action: auditLogActions.integrationJobRetried,
          entityType: auditLogEntityTypes.integrationJob,
          entityId: id,
          metadata: {
            fromStatus: existing.status,
            previousAttempts: existing.attempts,
            previousErrorCode: resolveIntegrationJobAdminErrorCode(
              existing.type,
              existing.lastError,
            ),
            previousNextRetryAt: existing.nextRetryAt?.toISOString() ?? null,
            previousAdminRetries,
            toStatus: IntegrationJobStatus.PENDING,
          },
          actorUserId,
        },
      );

      return transaction.integrationJob.findUnique({ where: { id } });
    });
  }

  scheduleEmailDeliveryRetry(payload: unknown, nextRetryAt: Date) {
    const email = parseEmailIntegrationJobPayload(payload);
    if (email === null) return Promise.resolve(0);
    return scheduleNotificationEmailDeliveryRetry(this.prisma, {
      userId: email.userId,
      dedupeKey: email.dedupeKey,
      nextRetryAt,
    });
  }

  markEmailDeliveryDead(payload: unknown) {
    const email = parseEmailIntegrationJobPayload(payload);
    if (email === null) return Promise.resolve(0);
    return markNotificationEmailDeliveryDead(this.prisma, {
      userId: email.userId,
      dedupeKey: email.dedupeKey,
    });
  }

  async deleteDeadLetterOlderThan(before: Date) {
    const eligible: Prisma.IntegrationJobWhereInput = {
      status: IntegrationJobStatus.DLQ,
      updatedAt: { lt: before },
      OR: [
        { lastError: null },
        { lastError: { notIn: [integrationJobProcessingOutcomeUnknown, integrationJobProviderOutcomeUnknown] } },
      ],
    };
    const candidates = await this.prisma.integrationJob.findMany({
      where: eligible,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: integrationJobDlqRetentionBatchSize,
      select: { id: true, version: true },
    });
    if (candidates.length === 0) return { count: 0 };
    // Recheck eligibility and the fencing version at deletion time: an admin
    // retry or other transition after selection must never delete a live job.
    return this.prisma.integrationJob.deleteMany({
      where: {
        ...eligible,
        AND: [{ OR: candidates.map(({ id, version }) => ({ id, version })) }],
      },
    });
  }
}
