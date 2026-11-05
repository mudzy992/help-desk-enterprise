import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthorizationModule } from '../../authorization/authorization.module';
import { SettingsModule } from '../../settings/settings.module';
import { TicketConfidentialConfigurationLoader } from '../../tickets/confidential/ticket-confidential-configuration.loader';
import { MAIL_TRANSPORT } from '../email/mail-transport';
import { SmtpMailTransport } from '../email/smtp-mail-transport';
import { notificationDigestQueueName } from './notification-digest.constants';
import { NotificationDigestProcessor } from './notification-digest.processor';
import { NotificationDigestSchedulerService } from './notification-digest.scheduler.service';
import { NotificationDigestService } from './notification-digest.service';
import { WeeklyTicketReportService } from './weekly-ticket-report.service';

/** Paket 2.2 (§5): digest and quiet-hours summaries, owned by the worker. */
@Module({
  imports: [
    SettingsModule,
    AuthorizationModule,
    BullModule.registerQueue({ name: notificationDigestQueueName }),
  ],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    TicketConfidentialConfigurationLoader,
    NotificationDigestService,
    WeeklyTicketReportService,
    NotificationDigestProcessor,
    NotificationDigestSchedulerService,
  ],
})
export class NotificationDigestWorkerModule {}
