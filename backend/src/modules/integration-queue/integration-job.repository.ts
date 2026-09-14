import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { integrationQueueAdminStatuses } from './integration-queue.constants';

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

  listByStatus(status: IntegrationJobStatus) {
    if (!integrationQueueAdminStatuses.includes(status)) {
      return Promise.resolve([]);
    }
    return this.prisma.integrationJob.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
    });
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

  resetForAdminRetry(id: string) {
    return this.prisma.integrationJob.update({
      where: { id },
      data: {
        status: IntegrationJobStatus.PENDING,
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
      },
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
