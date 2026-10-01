import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MAIL_TRANSPORT } from '../../notifications/email/mail-transport';
import { SmtpMailTransport } from '../../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../../settings/settings.module';
import { ProblemAccessService } from '../problem-access.service';
import { ProblemNotifier } from '../problem-notifier';
import { problemSweepQueueName } from './problem-sweep.constants';
import { ProblemSweepProcessor } from './problem-sweep.processor';
import { ProblemSweepSchedulerService } from './problem-sweep.scheduler.service';
import { ProblemSweepService } from './problem-sweep.service';

/** Paket 3.3 (P5): problem targets and auto-close, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: problemSweepQueueName }), SettingsModule],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    ProblemAccessService,
    ProblemNotifier,
    ProblemSweepService,
    ProblemSweepProcessor,
    ProblemSweepSchedulerService,
  ],
})
export class ProblemSweepWorkerModule {}
