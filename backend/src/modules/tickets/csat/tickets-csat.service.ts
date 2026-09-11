import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { TicketArchiveConfigurationLoader } from '../archive/ticket-archive-configuration.loader';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { TicketGuardrailsConfigurationLoader } from '../guardrails/ticket-guardrails-configuration.loader';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketRedactionConfigurationLoader } from '../redaction/ticket-redaction-configuration.loader';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toSingleTicketClientResponse } from '../to-ticket-client-responses';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import type { TicketMutationContext, TicketResponse } from '../tickets.types';
import type { SubmitTicketCsatInput, TicketCsatSummary } from './csat.types';
import { submitTicketCsat } from './submit-ticket-csat';
import { summarizeVisibleTicketCsat } from './summarize-visible-ticket-csat';
import { TicketCsatConfigurationLoader } from './ticket-csat-configuration.loader';

@Injectable()
export class TicketsCsatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly csatLoader: TicketCsatConfigurationLoader,
    private readonly archiveLoader: TicketArchiveConfigurationLoader,
    private readonly guardrailsLoader: TicketGuardrailsConfigurationLoader,
    private readonly redactionLoader: TicketRedactionConfigurationLoader,
    private readonly reopenLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesLoader: TicketCloseCodesConfigurationLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  submit(
    ticketId: string,
    body: SubmitTicketCsatInput,
    context: TicketMutationContext,
  ): Promise<TicketResponse> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      const messages: TicketPersistedMessageSink = [];
      const { ticket } = await submitTicketCsat({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        ticketId,
        body,
        context: gated,
        configuration: await this.csatLoader.load(),
        guardrails: await this.guardrailsLoader.load(),
        redaction: await this.redactionLoader.load(),
        messages,
      });
      publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
      return toSingleTicketClientResponse(this.prisma, ticket, {
        reopen: await this.reopenLoader.load(),
        closeCodes: await this.closeCodesLoader.load(),
        csat: await this.csatLoader.load(),
        actorUserId: gated.actorUserId,
      });
    });
  }

  summarize(context: TicketMutationContext): Promise<TicketCsatSummary> {
    return executeTicketOperation(async () =>
      summarizeVisibleTicketCsat({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        context: await this.accessPolicies.bind(context),
        archive: await this.archiveLoader.load(),
      }),
    );
  }
}
