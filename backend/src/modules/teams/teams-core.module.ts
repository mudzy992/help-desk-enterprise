import { Module } from '@nestjs/common';
import { IntegrationQueueCoreModule } from '../integration-queue/integration-queue-core.module';
import { SettingsModule } from '../settings/settings.module';
import { PrismaTeamsSimulatorOutbox } from './prisma-teams-simulator-outbox';
import { TeamsConfigurationService } from './teams-configuration.service';
import { TeamsConversationsService } from './teams-conversations.service';
import { TeamsDeliveryService } from './teams-delivery.service';
import { TeamsNotificationPlanner } from './teams-notification-planner.service';
import { TeamsTransportFactory } from './teams-transport.factory';

/**
 * Paket 3.1: the part of the connector both processes need — the API (inbound,
 * notifications written by requests) and the worker (TEAMS jobs, notifications
 * written by sweeps). No controllers and no authentication dependencies.
 */
@Module({
  imports: [SettingsModule, IntegrationQueueCoreModule],
  providers: [
    TeamsConfigurationService,
    PrismaTeamsSimulatorOutbox,
    TeamsTransportFactory,
    TeamsConversationsService,
    TeamsDeliveryService,
    TeamsNotificationPlanner,
  ],
  exports: [TeamsConfigurationService, PrismaTeamsSimulatorOutbox, TeamsTransportFactory, TeamsConversationsService, TeamsDeliveryService],
})
export class TeamsCoreModule {}
