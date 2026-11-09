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
 * Expired PROCESSING claims are quarantined as unknown, never blindly replayed:
 * a provider side effect may already have happened or still be in flight.
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
    const expired = await this.integrationJobRepository.listExpiredProcessingPage(
      now,
      integrationQueueDispatchReconcileBatchSize,
    );
    let failed = 0;
    for (const claim of expired) {
      try {
        if (await this.integrationJobRepository.quarantineExpiredProcessing(claim, now)) {
          this.logger.warn(`integration_job_processing_expired id=${claim.id} outcome=unknown replay=blocked`);
        }
      } catch {
        failed += 1;
        this.logger.warn(`integration_job_processing_quarantine_failed id=${claim.id}`);
      }
    }
    const jobs = await this.integrationJobRepository.listDispatchablePage(
      now,
      integrationQueueDispatchReconcileBatchSize,
    );

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

    return { processed: expired.length + jobs.length, failed };
  }
}
