import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../settings/settings.module';
import { privacyQueueName } from './privacy.constants';
import { PrivacyProcessor } from './privacy.processor';
import { privacyCoreProviders } from './privacy.providers';
import { PrivacySchedulerService } from './privacy.scheduler.service';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { PrivacyMailer } from './notices/privacy-mailer.service';

/** Paket 2.6: privacy jobs in the worker (no controllers). */
@Module({
  imports: [SettingsModule, BullModule.registerQueue({ name: privacyQueueName })],
  providers: [
    ...privacyCoreProviders,
    PrivacyProcessor,
    PrivacySchedulerService,
    PrivacyMailer,
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
  ],
})
export class PrivacyWorkerModule {}
