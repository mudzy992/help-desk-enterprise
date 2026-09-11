import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoutingModule } from '../routing/routing.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketAssignmentConfigurationLoader } from './assignment/ticket-assignment-configuration.loader';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    RoutingModule,
    SettingsModule,
  ],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    TicketAssignmentService,
    TicketAssignmentConfigurationLoader,
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
