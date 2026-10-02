import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TeamsCardRefresher } from './teams-card-refresher.service';
import { TeamsActivityRouter } from './teams-activity-router.service';
import { TeamsCoreModule } from './teams-core.module';
import { TeamsIdentityService } from './teams-identity.service';
import { TeamsInboundController } from './teams-inbound.controller';
import { TeamsInboundService } from './teams-inbound.service';

/** Paket 3.1: Microsoft Teams connector (behind the `teams` addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, TicketsModule, TeamsCoreModule],
  controllers: [TeamsInboundController],
  providers: [TeamsIdentityService, TeamsActivityRouter, TeamsInboundService, TeamsCardRefresher],
  exports: [TeamsCoreModule, TeamsIdentityService, TeamsActivityRouter],
})
export class TeamsModule {}
