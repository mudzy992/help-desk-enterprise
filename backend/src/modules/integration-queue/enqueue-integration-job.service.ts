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
      const lastError =
        error instanceof Error ? error.message : 'Failed to enqueue BullMQ job';
      await this.integrationJobRepository.markFailed(
        job.id,
        lastError,
        new Date(),
      );
      throw error;
    }
    this.logger.log(
      `integration_job id=${job.id} type=${job.type} status=PENDING`,
    );
    return job;
  }
}
