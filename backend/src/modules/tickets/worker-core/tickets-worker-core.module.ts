import { Module } from '@nestjs/common';
import { PrincipalContextLoader } from '../../../common/principal-context/principal-context.loader';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingConfigurationLoader } from '../../routing/routing-configuration.loader';
import { RoutingService } from '../../routing/routing.service';
import { SettingsModule } from '../../settings/settings.module';
import { SlaScanWorkerModule } from '../../sla/sla-scan-worker.module';
import { TemplatesConfigurationLoader } from '../../templates/templates-configuration.loader';
import { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { TicketArchiveConfigurationLoader } from '../archive/ticket-archive-configuration.loader';
import { TicketAssignmentConfigurationLoader } from '../assignment/ticket-assignment-configuration.loader';
import { TicketAssignmentService } from '../assignment/ticket-assignment.service';
import { TICKET_ATTACHMENT_STORAGE } from '../attachments/attachment-storage.token';
import { DiskTicketAttachmentStorage } from '../attachments/disk-ticket-attachment-storage';
import { resolveUploadRoot } from '../attachments/resolve-upload-root';
import { TicketAttachmentConfigurationLoader } from '../attachments/ticket-attachment-configuration.loader';
import { TicketsAttachmentsService } from '../attachments/tickets-attachments.service';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import { TicketConfidentialConfigurationLoader } from '../confidential/ticket-confidential-configuration.loader';
import { TicketCsatConfigurationLoader } from '../csat/ticket-csat-configuration.loader';
import { TicketGuardrailsConfigurationLoader } from '../guardrails/ticket-guardrails-configuration.loader';
import { TicketLabelCacheService } from '../labels/ticket-label-cache.service';
import { TicketRedactionConfigurationLoader } from '../redaction/ticket-redaction-configuration.loader';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import { TicketsReopenService } from '../reopen/tickets-reopen.service';
import { TicketRequiredFieldsConfigurationLoader } from '../required-fields/ticket-required-fields-configuration.loader';
import { TicketSafeLoggingConfigurationLoader } from '../safe-logging/ticket-safe-logging-configuration.loader';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketCollaborationConfigurationLoader } from '../ticket-collaboration-configuration.loader';
import { TicketRealtimeBridgeModule } from '../ticket-realtime-bridge.module';
import { TicketsCollaborationService } from '../tickets-collaboration.service';
import { TicketsService } from '../tickets.service';
import { UnroutedQueueConfigurationLoader } from '../unrouted/unrouted-queue-configuration.loader';
import { WaitingForUserConfigurationLoader } from '../waiting-for-user/waiting-for-user-configuration.loader';

/**
 * Paket 2.3: the ticket write path for worker jobs (inbound e-mail), without
 * controllers or gateways. The services are the exact ones the API uses, so
 * an e-mail reply runs the same access checks, redaction, waiting-for-user
 * logic and SLA timers as a reply typed in the UI; realtime events travel to
 * the API over the Redis bridge (and from there to notifications fan-out).
 * `TicketsModule` itself is never imported by the worker.
 */
@Module({
  imports: [SettingsModule, SlaScanWorkerModule, TicketRealtimeBridgeModule],
  providers: [
    // Plain providers instead of AuthorizationModule/RoutingModule: those carry
    // controllers and interceptors that depend on API-only realtime hubs.
    PrincipalContextLoader,
    AuthorizationContextLoader,
    RoutingConfigurationLoader,
    RoutingService,
    TicketsService,
    TicketsCollaborationService,
    TicketsAttachmentsService,
    TicketsReopenService,
    TicketAssignmentService,
    TicketAccessPolicyBinder,
    TicketLabelCacheService,
    TemplatesConfigurationLoader,
    UnroutedQueueConfigurationLoader,
    TicketApprovalsConfigurationLoader,
    TicketReopenConfigurationLoader,
    TicketCloseCodesConfigurationLoader,
    TicketRequiredFieldsConfigurationLoader,
    TicketRedactionConfigurationLoader,
    TicketGuardrailsConfigurationLoader,
    TicketConfidentialConfigurationLoader,
    TicketSafeLoggingConfigurationLoader,
    TicketArchiveConfigurationLoader,
    TicketCsatConfigurationLoader,
    TicketAssignmentConfigurationLoader,
    TicketCollaborationConfigurationLoader,
    WaitingForUserConfigurationLoader,
    TicketAttachmentConfigurationLoader,
    {
      provide: TICKET_ATTACHMENT_STORAGE,
      useFactory: () => new DiskTicketAttachmentStorage(resolveUploadRoot()),
    },
  ],
  exports: [TicketsService, TicketsCollaborationService, TicketsAttachmentsService, TicketsReopenService],
})
export class TicketsWorkerCoreModule {}
