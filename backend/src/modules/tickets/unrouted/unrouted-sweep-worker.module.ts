import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../../settings/settings.module';
import { UnroutedQueueConfigurationLoader } from './unrouted-queue-configuration.loader';
import { UnroutedSweepService } from './unrouted-sweep.service';
import { UnroutedSweepProcessor } from './unrouted-sweep.processor';
import { UnroutedSweepSchedulerService } from './unrouted-sweep.scheduler.service';
import { unroutedSweepQueueName } from './unrouted-sweep.job.constants';

/** Package 1.7 (U2): unrouted overdue warnings and weekly digest, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: unroutedSweepQueueName }), SettingsModule],
  providers: [
    UnroutedQueueConfigurationLoader,
    UnroutedSweepService,
    UnroutedSweepProcessor,
    UnroutedSweepSchedulerService,
  ],
})
export class UnroutedSweepWorkerModule {}
