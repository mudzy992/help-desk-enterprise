import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../../settings/settings.module';
import { SlaScanWorkerModule } from '../../sla/sla-scan-worker.module';
import { TicketGuardrailsConfigurationLoader } from '../guardrails/ticket-guardrails-configuration.loader';
import { TicketRealtimeBridgeModule } from '../ticket-realtime-bridge.module';
import { WaitingForUserConfigurationLoader } from './waiting-for-user-configuration.loader';
import { WaitingForUserAutomationService } from './waiting-for-user-automation.service';
import { WaitingForUserProcessor } from './waiting-for-user.processor';
import { WaitingForUserSchedulerService } from './waiting-for-user.scheduler.service';
import { waitingForUserQueueName } from './waiting-for-user.job.constants';

/**
 * Phase 4.1 (plan §4.1): the waiting-for-user sweep, worker-only.
 *
 * It imports `SlaScanWorkerModule` because the sweep re-applies SLA timers when a
 * ticket leaves `WAITING_FOR_USER` (`TicketSlaTimersService`); that module already
 * owns those timers, so the worker keeps a single SLA implementation.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: waitingForUserQueueName }),
    SettingsModule,
    SlaScanWorkerModule,
    TicketRealtimeBridgeModule,
  ],
  providers: [
    WaitingForUserConfigurationLoader,
    TicketGuardrailsConfigurationLoader,
    WaitingForUserAutomationService,
    WaitingForUserProcessor,
    WaitingForUserSchedulerService,
  ],
})
export class WaitingForUserWorkerModule {}
