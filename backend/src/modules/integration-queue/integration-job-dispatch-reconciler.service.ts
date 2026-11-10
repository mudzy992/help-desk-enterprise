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
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { isQueuedIntegrationJobType } from './parse-integration-queue-types';
import { SettingsService } from '../settings/settings.service';

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
    private readonly settingsService: SettingsService,
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
    const listed = await this.integrationJobRepository.listDispatchablePage(
      now,
      integrationQueueDispatchReconcileBatchSize,
    );
    // Paused (runtime-disabled) types are not re-offered to BullMQ: offering
    // them would only churn the queue every sweep. The expired-claim
    // quarantine above runs regardless, since it is a safety path, not a
    // dispatch. If settings cannot be read we fail closed and offer nothing.
    let jobs: typeof listed;
    try {
      const settings = await loadIntegrationQueueSettings(this.settingsService);
      jobs = settings.enabled
        ? listed.filter((job) => isQueuedIntegrationJobType(job.type, settings.typeTokens))
        : [];
      const paused = listed.length - jobs.length;
      if (paused > 0) {
        this.logger.warn(
          `integration_job_dispatch_reconcile_paused paused=${paused} reason=${settings.enabled ? 'type_disabled' : 'queue_disabled'}`,
        );
      }
    } catch {
      jobs = [];
      this.logger.warn('integration_job_dispatch_reconcile_paused reason=settings_unavailable');
    }

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
