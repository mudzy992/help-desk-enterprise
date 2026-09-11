import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishForTicketId } from '../publish-for-ticket-id';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import type { TicketMutationContext } from '../tickets.types';
import { TICKET_ATTACHMENT_STORAGE } from './attachment-storage.token';
import type {
  TicketAttachmentResponse,
  TicketAttachmentStorage,
  TicketAttachmentUploadInput,
} from './attachments.types';
import { createTicketAttachment } from './create-ticket-attachment';
import { deleteTicketAttachment } from './delete-ticket-attachment';
import { downloadTicketAttachment } from './download-ticket-attachment';
import { listTicketAttachments } from './list-ticket-attachments';
import { TicketAttachmentConfigurationLoader } from './ticket-attachment-configuration.loader';

@Injectable()
export class TicketsAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketAttachmentConfigurationLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    @Inject(TICKET_ATTACHMENT_STORAGE)
    private readonly storage: TicketAttachmentStorage,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  list(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(async () =>
      listTicketAttachments(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
      ),
    );
  }

  upload(
    ticketId: string,
    file: TicketAttachmentUploadInput | undefined,
    context: TicketMutationContext,
  ): Promise<TicketAttachmentResponse> {
    return executeTicketOperation(async () => {
      const result = await createTicketAttachment(
        this.prisma,
        this.authorizationContextLoader,
        this.storage,
        await this.configurationLoader.load(),
        ticketId,
        file,
        await this.accessPolicies.bind(context),
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        result.messages,
      );
      return result.attachment;
    });
  }

  download(
    ticketId: string,
    attachmentId: string,
    context: TicketMutationContext,
  ) {
    return executeTicketOperation(async () =>
      downloadTicketAttachment(
        this.prisma,
        this.authorizationContextLoader,
        this.storage,
        ticketId,
        attachmentId,
        await this.accessPolicies.bind(context),
      ),
    );
  }

  remove(
    ticketId: string,
    attachmentId: string,
    context: TicketMutationContext,
  ): Promise<void> {
    return executeTicketOperation(async () => {
      const result = await deleteTicketAttachment(
        this.prisma,
        this.authorizationContextLoader,
        this.storage,
        ticketId,
        attachmentId,
        await this.accessPolicies.bind(context),
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        result.messages,
      );
    });
  }
}
