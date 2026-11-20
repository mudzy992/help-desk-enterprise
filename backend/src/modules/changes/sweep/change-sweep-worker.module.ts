import { BullModule } from '@nestjs/bullmq';
import { RedisService } from '../../../common/redis/redis.service';
import { ChangeDowntimeDriftMetricStore } from '../change-downtime-drift-metrics';
import { OutboxModule } from '../../../common/outbox/outbox.module';
import { Module } from '@nestjs/common';
import { MAIL_TRANSPORT } from '../../notifications/email/mail-transport';
import { SmtpMailTransport } from '../../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../../settings/settings.module';
import { ServiceAvailabilityConfigurationLoader } from '../../service-catalog/service-availability-configuration.loader';
import { ChangeScheduleService } from '../change-schedule.service';
import { ChangeDowntimeOutboxReconciler } from '../change-downtime-outbox-reconciler.service';
import { ChangeAccessService } from '../change-access.service';
import { ChangeNotifier } from '../change-notifier';
import { changeSweepQueueName } from './change-sweep.constants';
import { ChangeSweepProcessor } from './change-sweep.processor';
import { ChangeSweepSchedulerService } from './change-sweep.scheduler.service';
import { ChangeReminderOutboxDispatcher } from './change-reminder-outbox.dispatcher';
import { ChangeOwnerReconciler } from './change-owner-reconciler.service';
import { ChangeSweepService } from './change-sweep.service';

/** Paket 3.4 (§14): change reminders, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: changeSweepQueueName }), SettingsModule, OutboxModule],
  providers: [
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    ChangeAccessService,
    ServiceAvailabilityConfigurationLoader,
    ChangeScheduleService,
    ChangeDowntimeOutboxReconciler,
    ChangeOwnerReconciler,
    ChangeNotifier,
    ChangeSweepService,
    ChangeReminderOutboxDispatcher,
    ChangeSweepProcessor,
    ChangeSweepSchedulerService,
    // W7.69 (BA-changes-13): the reconciler publishes its last completed drift
    // pass here; the worker's ops collector reads the same record.
    {
      provide: ChangeDowntimeDriftMetricStore,
      useFactory: (redis: RedisService) =>
        new ChangeDowntimeDriftMetricStore(redis.getClient()),
      inject: [RedisService],
    },
  ],
})
export class ChangeSweepWorkerModule {}
