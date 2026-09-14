import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoutingModule } from '../routing/routing.module';
import { SettingsModule } from '../settings/settings.module';
import { SlaModule } from '../sla/sla.module';
import { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import { TicketsApprovalsController } from './approvals/tickets-approvals.controller';
import { TicketsApprovalsService } from './approvals/tickets-approvals.service';
import { TicketAssignmentConfigurationLoader } from './assignment/ticket-assignment-configuration.loader';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { TicketCollaborationConfigurationLoader } from './ticket-collaboration-configuration.loader';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { TicketsCollaborationController } from './tickets-collaboration.controller';
import { TicketsCollaborationService } from './tickets-collaboration.service';
import { TicketsRemoteController } from './remote/tickets-remote.controller';
import { TicketsRemoteService } from './remote/tickets-remote.service';
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
import { TicketCloseCodesConfigurationLoader } from './close-codes/ticket-close-codes-configuration.loader';
import { TicketRequiredFieldsConfigurationLoader } from './required-fields/ticket-required-fields-configuration.loader';
import { TicketRedactionConfigurationLoader } from './redaction/ticket-redaction-configuration.loader';
import { TicketGuardrailsConfigurationLoader } from './guardrails/ticket-guardrails-configuration.loader';
import { TicketSplitConfigurationLoader } from './split/ticket-split-configuration.loader';
import { TicketsSplitController } from './split/tickets-split.controller';
import { TicketsSplitService } from './split/tickets-split.service';
import { TicketBulkConfigurationLoader } from './bulk/ticket-bulk-configuration.loader';
import { TicketsBulkController } from './bulk/tickets-bulk.controller';
import { TicketsBulkService } from './bulk/tickets-bulk.service';
import { TicketSavedViewsConfigurationLoader } from './saved-views/ticket-saved-views-configuration.loader';
import { TicketsSavedViewsController } from './saved-views/tickets-saved-views.controller';
import { TicketsSavedViewsService } from './saved-views/tickets-saved-views.service';
import { TicketConfidentialConfigurationLoader } from './confidential/ticket-confidential-configuration.loader';
import { TicketSafeLoggingConfigurationLoader } from './safe-logging/ticket-safe-logging-configuration.loader';
import { TicketAccessPolicyBinder } from './ticket-access-policy-binder';
import { TicketsConfidentialController } from './confidential/tickets-confidential.controller';
import { TicketsConfidentialService } from './confidential/tickets-confidential.service';
import { WaitingForUserAutomationService } from './waiting-for-user/waiting-for-user-automation.service';
import { WaitingForUserConfigurationLoader } from './waiting-for-user/waiting-for-user-configuration.loader';
import { TicketArchiveAutomationService } from './archive/ticket-archive-automation.service';
import { TicketArchiveConfigurationLoader } from './archive/ticket-archive-configuration.loader';
import { TicketCsatConfigurationLoader } from './csat/ticket-csat-configuration.loader';
import { TicketsCsatController } from './csat/tickets-csat.controller';
import { TicketsCsatSummaryController } from './csat/tickets-csat-summary.controller';
import { TicketsCsatService } from './csat/tickets-csat.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthenticationModule,
    AuthorizationModule,
    RoutingModule,
    SettingsModule,
    SlaModule,
  ],
  // Controllers with a static path segment under /tickets must register before
  // TicketsController, otherwise its GET /tickets/:ticketId route shadows them.
  controllers: [
    TicketsSavedViewsController,
    TicketsCsatSummaryController,
    TicketsBulkController,
    TicketsController,
    TicketsCollaborationController,
    TicketsRemoteController,
    TicketsAttachmentsController,
    TicketsApprovalsController,
    TicketsReopenController,
    TicketsSplitController,
    TicketsConfidentialController,
    TicketsCsatController,
  ],
  providers: [
    TicketsService,
    TicketsApprovalsService,
    TicketApprovalsConfigurationLoader,
    TicketsReopenService,
    TicketReopenConfigurationLoader,
    TicketCloseCodesConfigurationLoader,
    TicketRequiredFieldsConfigurationLoader,
    TicketRedactionConfigurationLoader,
    TicketGuardrailsConfigurationLoader,
    TicketConfidentialConfigurationLoader,
    TicketSafeLoggingConfigurationLoader,
    TicketArchiveConfigurationLoader,
    TicketCsatConfigurationLoader,
    TicketAccessPolicyBinder,
    TicketsConfidentialService,
    TicketsCsatService,
    TicketsSplitService,
    TicketSplitConfigurationLoader,
    TicketsBulkService,
    TicketBulkConfigurationLoader,
    TicketsSavedViewsService,
    TicketSavedViewsConfigurationLoader,
    WaitingForUserConfigurationLoader,
    WaitingForUserAutomationService,
    TicketArchiveAutomationService,
    TicketsCollaborationService,
    TicketsRemoteService,
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
    TicketsSplitService,
    TicketsBulkService,
    TicketsSavedViewsService,
    TicketsCollaborationService,
    TicketsTimeTrackingService,
    TicketsAttachmentsService,
    TicketRealtimeHub,
  ],
})
export class TicketsModule {}
