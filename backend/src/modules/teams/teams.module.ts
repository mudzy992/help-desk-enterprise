import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { ChangesModule } from '../changes/changes.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { OnCallModule } from '../on-call/on-call.module';
import { StatusPageModule } from '../status-page/status-page.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TeamsActionsService } from './teams-actions.service';
import { TeamsQueriesService } from './teams-queries.service';
import { TeamsAdminController, TeamsMeController } from './teams-admin.controller';
import { TeamsAdminService } from './teams-admin.service';
import { TeamsCardRefresher } from './teams-card-refresher.service';
import { TeamsActivityRouter } from './teams-activity-router.service';
import { TeamsCoreModule } from './teams-core.module';
import { TeamsIdentityService } from './teams-identity.service';
import { TeamsInboundController } from './teams-inbound.controller';
import { TeamsInboundService } from './teams-inbound.service';

/** Paket 3.1: Microsoft Teams connector (behind the `teams` addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule, TicketsModule, ChangesModule, KnowledgeBaseModule, StatusPageModule, OnCallModule, TeamsCoreModule],
  controllers: [TeamsInboundController, TeamsAdminController, TeamsMeController],
  providers: [TeamsIdentityService, TeamsActivityRouter, TeamsInboundService, TeamsCardRefresher, TeamsActionsService, TeamsQueriesService, TeamsAdminService],
  exports: [TeamsCoreModule, TeamsIdentityService, TeamsActivityRouter],
})
export class TeamsModule {}
