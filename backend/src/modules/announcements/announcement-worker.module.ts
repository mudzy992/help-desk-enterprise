import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { AnnouncementDeliveryService } from './announcement-delivery.service';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementSweepProcessor } from './announcement-sweep.processor';
import { AnnouncementSweepSchedulerService } from './announcement-sweep.scheduler.service';
import { announcementSweepQueueName } from './announcement-sweep.job.constants';

/** Paket 2.9 (K2/K2b): the announcement sweep and e-mail/Teams delivery, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: announcementSweepQueueName }), SettingsModule],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    AnnouncementsService,
    AnnouncementDeliveryService,
    AnnouncementSweepProcessor,
    AnnouncementSweepSchedulerService,
  ],
})
export class AnnouncementWorkerModule {}
