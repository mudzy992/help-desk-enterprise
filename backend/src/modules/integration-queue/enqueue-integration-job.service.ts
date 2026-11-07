import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client';
import { integrationQueueName } from './integration-queue.constants';
import type { EnqueueIntegrationJobInput } from './integration-queue.types';
import type { IntegrationQueueJobData } from './integration-queue.types';
import { IntegrationJobRepository } from './integration-job.repository';

@Injectable()
export class EnqueueIntegrationJobService {
  private readonly logger = new Logger(EnqueueIntegrationJobService.name);

  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    @InjectQueue(integrationQueueName)
    private readonly integrationQueue: Queue<IntegrationQueueJobData>,
  ) {}

  async enqueue(input: EnqueueIntegrationJobInput) {
    const job = await this.integrationJobRepository.createPending({
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
    });
    try {
      await this.integrationQueue.add(
        input.type,
        { integrationJobId: job.id },
        {
          jobId: job.id,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error) {
      // PostgreSQL is the durable outbox: keep the row PENDING so the worker's
      // periodic dispatcher can retry after Redis recovers. The add may have
      // succeeded even when its acknowledgement was lost; jobId=job.id is stable.
      this.logger.warn(
        `integration_job_dispatch_deferred id=${job.id} error=${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
    this.logger.log(
      `integration_job id=${job.id} type=${job.type} status=PENDING`,
    );
    return job;
  }
}
