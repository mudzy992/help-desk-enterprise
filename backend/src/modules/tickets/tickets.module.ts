import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoutingModule } from '../routing/routing.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import { TicketsApprovalsController } from './approvals/tickets-approvals.controller';
import { TicketsApprovalsService } from './approvals/tickets-approvals.service';
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
import { TICKET_ATTACHMENT_STORAGE } from './attachments/attachment-storage.token';
import { DiskTicketAttachmentStorage } from './attachments/disk-ticket-attachment-storage';
import { resolveUploadRoot } from './attachments/resolve-upload-root';
import { TicketAttachmentConfigurationLoader } from './attachments/ticket-attachment-configuration.loader';
import { TicketsAttachmentsController } from './attachments/tickets-attachments.controller';
import { TicketsAttachmentsService } from './attachments/tickets-attachments.service';
import { TicketReopenConfigurationLoader } from './reopen/ticket-reopen-configuration.loader';
import { TicketsReopenController } from './reopen/tickets-reopen.controller';
import { TicketsReopenService } from './reopen/tickets-reopen.service';
import { WaitingForUserAutomationService } from './waiting-for-user/waiting-for-user-automation.service';
import { WaitingForUserConfigurationLoader } from './waiting-for-user/waiting-for-user-configuration.loader';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthenticationModule,
    AuthorizationModule,
    RoutingModule,
    SettingsModule,
  ],
  controllers: [
    TicketsController,
    TicketsCollaborationController,
    TicketsAttachmentsController,
    TicketsApprovalsController,
    TicketsReopenController,
  ],
  providers: [
    TicketsService,
    TicketsApprovalsService,
    TicketApprovalsConfigurationLoader,
    TicketsReopenService,
    TicketReopenConfigurationLoader,
    WaitingForUserConfigurationLoader,
    WaitingForUserAutomationService,
    TicketsCollaborationService,
    TicketsTimeTrackingService,
    TicketsAttachmentsService,
    TicketAssignmentService,
    TicketAssignmentConfigurationLoader,
    TicketCollaborationConfigurationLoader,
    TicketAttachmentConfigurationLoader,
    {
      provide: TICKET_ATTACHMENT_STORAGE,
      useFactory: () => new DiskTicketAttachmentStorage(resolveUploadRoot()),
    },
    TicketRealtimeHub,
    TicketChatGateway,
  ],
  exports: [
    TicketsService,
    TicketsApprovalsService,
    TicketsReopenService,
    TicketsCollaborationService,
    TicketsTimeTrackingService,
    TicketsAttachmentsService,
    TicketRealtimeHub,
  ],
})
export class TicketsModule {}
