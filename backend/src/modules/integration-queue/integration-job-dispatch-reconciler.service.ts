import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { IntegrationJobStatus } from '../../generated/prisma/enums';
import { IntegrationJobRepository } from './integration-job.repository';
import {
  integrationQueueDispatchReconcileBatchSize,
  integrationQueueName,
} from './integration-queue.constants';
import type { IntegrationQueueJobData } from './integration-queue.types';

/**
 * Repairs the PostgreSQL/BullMQ dual-write boundary. IntegrationJob is the
 * durable source of truth: a PENDING row is eligible immediately, while FAILED
 * rows are eligible only when their recorded backoff is due. Stable BullMQ job
 * ids make a lost enqueue acknowledgement safe to retry on the next sweep.
 *
 * This deliberately does not reclaim PROCESSING rows; that requires the separate
 * processor lease/CAS lifecycle and remains BA-integration-queue-02/05 scope.
 */
@Injectable()
export class IntegrationJobDispatchReconcilerService {
  private readonly logger = new Logger(
    IntegrationJobDispatchReconcilerService.name,
  );

  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    @InjectQueue(integrationQueueName)
    private readonly integrationQueue: Queue<IntegrationQueueJobData>,
  ) {}

  async sweep(now: Date = new Date()): Promise<{ processed: number; failed: number }> {
    const jobs = await this.integrationJobRepository.listDispatchablePage(
      now,
      integrationQueueDispatchReconcileBatchSize,
    );
    let failed = 0;

    for (const job of jobs) {
      const jobId =
        job.status === IntegrationJobStatus.FAILED
          ? `${job.id}:${job.attempts}`
          : job.id;
      try {
        await this.integrationQueue.add(
          job.type,
          { integrationJobId: job.id },
          {
            jobId,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `integration_job_dispatch_reconcile_failed id=${job.id} status=${job.status} error=${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      }
    }

    return { processed: jobs.length, failed };
  }
}
