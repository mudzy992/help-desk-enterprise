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
  integrationQueueAdminPageSize,
  integrationQueueAdminStatuses,
} from './integration-queue.constants';

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

  async listByStatusPage(
    status: IntegrationJobStatus,
    cursor: string | null,
  ) {
    if (!integrationQueueAdminStatuses.includes(status)) {
      return { items: [], nextCursor: null } as const;
    }
    const rows = await this.prisma.integrationJob.findMany({
      where: { status },
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

  markProcessing(id: string) {
    return this.prisma.integrationJob.update({
      where: { id },
      data: {
        status: IntegrationJobStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
  }

  markCompleted(id: string) {
    return this.prisma.integrationJob.update({
      where: { id },
      data: {
        status: IntegrationJobStatus.COMPLETED,
        lastError: null,
        nextRetryAt: null,
      },
    });
  }

  markFailed(id: string, lastError: string, nextRetryAt: Date) {
    return this.prisma.integrationJob.update({
      where: { id },
      data: {
        status: IntegrationJobStatus.FAILED,
        lastError,
        nextRetryAt,
      },
    });
  }

  markDeadLetter(id: string, lastError: string) {
    return this.prisma.integrationJob.update({
      where: { id },
      data: {
        status: IntegrationJobStatus.DLQ,
        lastError,
        nextRetryAt: null,
      },
    });
  }

  async resetForAdminRetry(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.integrationJob.findUnique({
        where: { id },
      });
      if (
        existing === null ||
        (existing.status !== IntegrationJobStatus.FAILED &&
          existing.status !== IntegrationJobStatus.DLQ)
      ) {
        return null;
      }

      const updated = await transaction.integrationJob.updateMany({
        where: { id, status: existing.status },
        data: {
          status: IntegrationJobStatus.PENDING,
          attempts: 0,
          lastError: null,
          nextRetryAt: null,
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

      await recordAuditEntry(
        transaction as unknown as AuditLogTransactionalClient,
        {
          action: auditLogActions.integrationJobRetried,
          entityType: auditLogEntityTypes.integrationJob,
          entityId: id,
          metadata: {
            fromStatus: existing.status,
            previousAttempts: existing.attempts,
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

  deleteDeadLetterOlderThan(before: Date) {
    return this.prisma.integrationJob.deleteMany({
      where: {
        status: IntegrationJobStatus.DLQ,
        updatedAt: { lt: before },
      },
    });
  }
}
