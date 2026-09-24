import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../../settings/settings.module';
import { TicketGuardrailsConfigurationLoader } from '../guardrails/ticket-guardrails-configuration.loader';
import { TicketRealtimeBridgeModule } from '../ticket-realtime-bridge.module';
import { ticketArchiveQueueName } from './ticket-archive.job.constants';
import { TicketArchiveAutomationService } from './ticket-archive-automation.service';
import { TicketArchiveConfigurationLoader } from './ticket-archive-configuration.loader';
import { TicketArchiveProcessor } from './ticket-archive.processor';
import { TicketArchiveSchedulerService } from './ticket-archive.scheduler.service';

/**
 * Phase 4.1 (plan §4.1): everything the archive sweep needs, and nothing the API
 * needs. The worker owns the schedule; the API process no longer registers the
 * automation service at all (`tickets.module.ts`), which is what "the API only does
 * request/response + websocket" means in practice.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: ticketArchiveQueueName }),
    SettingsModule,
    TicketRealtimeBridgeModule,
  ],
  providers: [
    TicketArchiveConfigurationLoader,
    TicketGuardrailsConfigurationLoader,
    TicketArchiveAutomationService,
    TicketArchiveProcessor,
    TicketArchiveSchedulerService,
  ],
})
export class TicketArchiveWorkerModule {}
