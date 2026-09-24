import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../settings/settings.module';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { slaScanQueueName } from './sla-scan.constants';
import { SlaScanProcessor } from './sla-scan.processor';
import { SlaScanSchedulerService } from './sla-scan.scheduler.service';
import { TicketSlaTimersService } from './ticket-sla-timers.service';

/**
 * Phase 2.1 (plan §2.1): everything the SLA scan needs, and nothing the API
 * needs. The worker owns the schedule; the API process only applies timers on
 * ticket events (through `SlaModule`).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: slaScanQueueName }),
    SettingsModule,
  ],
  providers: [
    SlaConfigurationLoader,
    TicketSlaTimersService,
    SlaScanProcessor,
    SlaScanSchedulerService,
  ],
  exports: [TicketSlaTimersService],
})
export class SlaScanWorkerModule {}
