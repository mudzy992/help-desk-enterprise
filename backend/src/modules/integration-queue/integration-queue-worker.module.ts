import { Module } from '@nestjs/common';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { IntegrationJobDlqRetentionService } from './integration-job-dlq-retention.service';
import { IntegrationQueueCoreModule } from './integration-queue-core.module';
import { IntegrationQueueProcessor } from './integration-queue.processor';
import { ProcessEdgeEventIntegrationJobService } from './process-edge-event-integration-job.service';
import { ProcessEmailIntegrationJobService } from './process-email-integration-job.service';
import { ProcessTeamsStubIntegrationJobService } from './process-teams-stub-integration-job.service';
import { PublishEdgeEventToRedisService } from './publish-edge-event-to-redis.service';

@Module({
  imports: [IntegrationQueueCoreModule, SettingsModule],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    PublishEdgeEventToRedisService,
    ProcessEmailIntegrationJobService,
    ProcessEdgeEventIntegrationJobService,
    ProcessTeamsStubIntegrationJobService,
    IntegrationQueueProcessor,
    IntegrationJobDlqRetentionService,
  ],
})
export class IntegrationQueueWorkerModule {}
