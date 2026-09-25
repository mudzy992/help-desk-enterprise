import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../../settings/settings.module';
import { TicketRealtimeBridgeModule } from '../ticket-realtime-bridge.module';
import { TimeTrackingConfigurationLoader } from './time-tracking-configuration.loader';
import { TimeTrackingSweepProcessor } from './time-tracking-sweep.processor';
import { TimeTrackingSweepSchedulerService } from './time-tracking-sweep.scheduler.service';
import { timeTrackingSweepQueueName } from './time-tracking-sweep.job.constants';

/** Package 1.3: the timer sweep runs only in the worker process. */
@Module({
  imports: [
    BullModule.registerQueue({ name: timeTrackingSweepQueueName }),
    SettingsModule,
    TicketRealtimeBridgeModule,
  ],
  providers: [
    TimeTrackingConfigurationLoader,
    TimeTrackingSweepProcessor,
    TimeTrackingSweepSchedulerService,
  ],
})
export class TimeTrackingSweepWorkerModule {}
