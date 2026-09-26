import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../../settings/settings.module';
import { MAIL_TRANSPORT } from '../email/mail-transport';
import { SmtpMailTransport } from '../email/smtp-mail-transport';
import { notificationDigestQueueName } from './notification-digest.constants';
import { NotificationDigestProcessor } from './notification-digest.processor';
import { NotificationDigestSchedulerService } from './notification-digest.scheduler.service';
import { NotificationDigestService } from './notification-digest.service';

/** Paket 2.2 (§5): digest and quiet-hours summaries, owned by the worker. */
@Module({
  imports: [SettingsModule, BullModule.registerQueue({ name: notificationDigestQueueName })],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    NotificationDigestService,
    NotificationDigestProcessor,
    NotificationDigestSchedulerService,
  ],
})
export class NotificationDigestWorkerModule {}
