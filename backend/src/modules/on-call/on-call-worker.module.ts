import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../settings/settings.module';
import { OnCallService } from './on-call.service';
import { OnCallSweepProcessor } from './on-call-sweep.processor';
import { OnCallSweepSchedulerService } from './on-call-sweep.scheduler.service';
import { OnCallSweepService } from './on-call-sweep.service';
import { onCallSweepQueueName } from './on-call-sweep.job.constants';

/** Paket 2.9 (K3): the on-call sweep, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: onCallSweepQueueName }), SettingsModule],
  providers: [OnCallService, OnCallSweepService, OnCallSweepProcessor, OnCallSweepSchedulerService],
})
export class OnCallWorkerModule {}
