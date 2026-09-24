import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { IntegrationJobDlqRetentionService } from './integration-job-dlq-retention.service';
import { IntegrationQueueCoreModule } from './integration-queue-core.module';
import { IntegrationQueueProcessor } from './integration-queue.processor';
import { IntegrationQueueWorkerHeartbeatService } from './integration-queue-worker-heartbeat.service';
import { integrationWorkerMaintenanceQueueName } from './integration-worker-maintenance.job.constants';
import { IntegrationWorkerMaintenanceProcessor } from './integration-worker-maintenance.processor';
import { IntegrationWorkerMaintenanceSchedulerService } from './integration-worker-maintenance.scheduler.service';
import { ProcessEdgeEventIntegrationJobService } from './process-edge-event-integration-job.service';
import { ProcessEmailIntegrationJobService } from './process-email-integration-job.service';
import { ProcessTeamsStubIntegrationJobService } from './process-teams-stub-integration-job.service';
import { PublishEdgeEventToRedisService } from './publish-edge-event-to-redis.service';

@Module({
  imports: [
    IntegrationQueueCoreModule,
    SettingsModule,
    // Phase 4.1: the heartbeat and DLQ-retention timers became queue schedules.
    BullModule.registerQueue({ name: integrationWorkerMaintenanceQueueName }),
  ],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    PublishEdgeEventToRedisService,
    ProcessEmailIntegrationJobService,
    ProcessEdgeEventIntegrationJobService,
    ProcessTeamsStubIntegrationJobService,
    IntegrationQueueProcessor,
    IntegrationJobDlqRetentionService,
    IntegrationQueueWorkerHeartbeatService,
    IntegrationWorkerMaintenanceProcessor,
    IntegrationWorkerMaintenanceSchedulerService,
  ],
})
export class IntegrationQueueWorkerModule {}
