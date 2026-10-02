import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { SettingsModule } from '../settings/settings.module';
import { PrismaTeamsSimulatorOutbox } from './prisma-teams-simulator-outbox';
import { TeamsActivityRouter } from './teams-activity-router.service';
import { TeamsConfigurationService } from './teams-configuration.service';
import { TeamsConversationsService } from './teams-conversations.service';
import { TeamsIdentityService } from './teams-identity.service';
import { TeamsInboundController } from './teams-inbound.controller';
import { TeamsInboundService } from './teams-inbound.service';
import { TeamsTransportFactory } from './teams-transport.factory';

/** Paket 3.1: Microsoft Teams connector (behind the `teams` addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule],
  controllers: [TeamsInboundController],
  providers: [
    TeamsConfigurationService,
    PrismaTeamsSimulatorOutbox,
    TeamsTransportFactory,
    TeamsConversationsService,
    TeamsIdentityService,
    TeamsActivityRouter,
    TeamsInboundService,
  ],
  exports: [TeamsConfigurationService, TeamsTransportFactory, TeamsConversationsService, TeamsIdentityService, TeamsActivityRouter, PrismaTeamsSimulatorOutbox],
})
export class TeamsModule {}
