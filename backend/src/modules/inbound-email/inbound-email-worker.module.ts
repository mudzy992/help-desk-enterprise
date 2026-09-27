import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { TicketsWorkerCoreModule } from '../tickets/worker-core/tickets-worker-core.module';
import { inboundEmailQueueName } from './inbound-email.constants';
import { InboundEmailProcessor } from './inbound-email.processor';
import { InboundEmailSchedulerService } from './inbound-email.scheduler.service';
import { InboundEmailService } from './inbound-email.service';

/** Paket 2.3: reply by e-mail — mailbox polling, owned by the worker. */
@Module({
  imports: [SettingsModule, TicketsWorkerCoreModule, BullModule.registerQueue({ name: inboundEmailQueueName })],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    InboundEmailService,
    InboundEmailProcessor,
    InboundEmailSchedulerService,
  ],
})
export class InboundEmailWorkerModule {}
