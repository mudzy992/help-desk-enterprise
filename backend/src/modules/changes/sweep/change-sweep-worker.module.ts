import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MAIL_TRANSPORT } from '../../notifications/email/mail-transport';
import { SmtpMailTransport } from '../../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../../settings/settings.module';
import { ChangeAccessService } from '../change-access.service';
import { ChangeNotifier } from '../change-notifier';
import { changeSweepQueueName } from './change-sweep.constants';
import { ChangeSweepProcessor } from './change-sweep.processor';
import { ChangeSweepSchedulerService } from './change-sweep.scheduler.service';
import { ChangeSweepService } from './change-sweep.service';

/** Paket 3.4 (§14): change reminders, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: changeSweepQueueName }), SettingsModule],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    ChangeAccessService,
    ChangeNotifier,
    ChangeSweepService,
    ChangeSweepProcessor,
    ChangeSweepSchedulerService,
  ],
})
export class ChangeSweepWorkerModule {}
