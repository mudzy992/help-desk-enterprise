import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { OpsAlertEngine } from './ops-alert.engine';
import { OpsAlertNotifier, OPS_TEAMS_POSTER } from './ops-alert-notifier.service';
import { OpsConfigurationLoader } from './ops-configuration.loader';
import { opsHealthQueueName } from './ops-health.constants';
import { OpsHealthProcessor } from './ops-health.processor';
import { OpsHealthRunner } from './ops-health.runner';
import { OpsHealthSchedulerService } from './ops-health.scheduler.service';
import { OpsSignalCollector } from './ops-signal-collector';
import { postTeamsWebhook } from './teams-webhook';

/** Paket 2.7: the health loop in the worker (no controllers). */
@Module({
  imports: [SettingsModule, BullModule.registerQueue({ name: opsHealthQueueName })],
  providers: [
    OpsConfigurationLoader,
    OpsSignalCollector,
    OpsAlertNotifier,
    OpsAlertEngine,
    OpsHealthRunner,
    OpsHealthProcessor,
    OpsHealthSchedulerService,
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    { provide: OPS_TEAMS_POSTER, useValue: postTeamsWebhook },
  ],
})
export class OpsHealthWorkerModule {}
