import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { AnnouncementDeliveryService } from './announcement-delivery.service';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementRetentionProcessor } from './announcement-retention.processor';
import { AnnouncementRetentionSchedulerService } from './announcement-retention.scheduler.service';
import { announcementRetentionQueueName } from './announcement-retention.job.constants';
import { AnnouncementSweepProcessor } from './announcement-sweep.processor';
import { AnnouncementSweepSchedulerService } from './announcement-sweep.scheduler.service';
import { announcementSweepQueueName } from './announcement-sweep.job.constants';
import { TicketRealtimeBridgeModule } from '../tickets/ticket-realtime-bridge.module';

/** Paket 2.9 (K2/K2b): the announcement sweep and e-mail/Teams delivery, worker-only. */
@Module({
  // BA-announcements-20: TicketRealtimeBridgeModule gives the sweep a hub whose
  // announcement-changed events are forwarded to Redis for the API gateway.
  imports: [
    BullModule.registerQueue({ name: announcementSweepQueueName }),
    BullModule.registerQueue({ name: announcementRetentionQueueName }),
    SettingsModule,
    AuthorizationModule,
    TicketRealtimeBridgeModule,
  ],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    AnnouncementsService,
    AnnouncementDeliveryService,
    AnnouncementRetentionProcessor,
    AnnouncementRetentionSchedulerService,
    AnnouncementSweepProcessor,
    AnnouncementSweepSchedulerService,
  ],
})
export class AnnouncementWorkerModule {}
