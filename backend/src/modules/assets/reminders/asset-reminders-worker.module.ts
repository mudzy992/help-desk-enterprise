import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MAIL_TRANSPORT } from '../../notifications/email/mail-transport';
import { SmtpMailTransport } from '../../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../../settings/settings.module';
import { assetRemindersQueueName } from './asset-reminders.constants';
import { AssetRemindersProcessor } from './asset-reminders.processor';
import { AssetRemindersSchedulerService } from './asset-reminders.scheduler.service';
import { AssetRemindersService } from './asset-reminders.service';

/** Paket 3.2 (§10): expiry reminders, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: assetRemindersQueueName }), SettingsModule],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    AssetRemindersService,
    AssetRemindersProcessor,
    AssetRemindersSchedulerService,
  ],
})
export class AssetRemindersWorkerModule {}
