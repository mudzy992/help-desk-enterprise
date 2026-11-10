import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { integrationQueueName } from './integration-queue.constants';
import { EnqueueIntegrationJobService } from './enqueue-integration-job.service';
import { IntegrationJobDispatchReconcilerService } from './integration-job-dispatch-reconciler.service';
import { IntegrationJobRepository } from './integration-job.repository';

@Module({
  imports: [
    SettingsModule,
    BullModule.registerQueue({
      name: integrationQueueName,
    }),
  ],
  providers: [
    IntegrationJobRepository,
    EnqueueIntegrationJobService,
    IntegrationJobDispatchReconcilerService,
  ],
  exports: [
    BullModule,
    IntegrationJobRepository,
    EnqueueIntegrationJobService,
    IntegrationJobDispatchReconcilerService,
  ],
})
export class IntegrationQueueCoreModule {}
