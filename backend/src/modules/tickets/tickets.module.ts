import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoutingModule } from '../routing/routing.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketAssignmentConfigurationLoader } from './assignment/ticket-assignment-configuration.loader';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { TicketCollaborationConfigurationLoader } from './ticket-collaboration-configuration.loader';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { TicketsCollaborationController } from './tickets-collaboration.controller';
import { TicketsCollaborationService } from './tickets-collaboration.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketsTimeTrackingService } from './tickets-time-tracking.service';
import { TicketChatGateway } from '../websocket/ticket-chat.gateway';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    RoutingModule,
    SettingsModule,
  ],
  controllers: [TicketsController, TicketsCollaborationController],
  providers: [
    TicketsService,
    TicketsCollaborationService,
    TicketsTimeTrackingService,
    TicketAssignmentService,
    TicketAssignmentConfigurationLoader,
    TicketCollaborationConfigurationLoader,
    TicketRealtimeHub,
    TicketChatGateway,
  ],
  exports: [
    TicketsService,
    TicketsCollaborationService,
    TicketsTimeTrackingService,
    TicketRealtimeHub,
  ],
})
export class TicketsModule {}
