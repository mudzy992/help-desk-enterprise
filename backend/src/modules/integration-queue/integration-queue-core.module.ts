import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { integrationQueueName } from './integration-queue.constants';
import { EnqueueIntegrationJobService } from './enqueue-integration-job.service';
import { IntegrationJobRepository } from './integration-job.repository';

@Module({
  imports: [
    BullModule.registerQueue({
      name: integrationQueueName,
    }),
  ],
  providers: [IntegrationJobRepository, EnqueueIntegrationJobService],
  exports: [
    BullModule,
    IntegrationJobRepository,
    EnqueueIntegrationJobService,
  ],
})
export class IntegrationQueueCoreModule {}
