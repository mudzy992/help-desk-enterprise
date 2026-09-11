import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { executeTicketOperation } from '../execute-ticket-operation';
import type { TicketMutationContext } from '../tickets.types';
import { withTicketAccessPolicies } from '../with-ticket-access-policies';
import { TicketArchiveConfigurationLoader } from '../archive/ticket-archive-configuration.loader';
import { TicketConfidentialConfigurationLoader } from './ticket-confidential-configuration.loader';
import { TicketSafeLoggingConfigurationLoader } from '../safe-logging/ticket-safe-logging-configuration.loader';
import { requestConfidentialBreakGlass } from './request-confidential-break-glass';
import type { BreakGlassResponse } from './confidential.types';

@Injectable()
export class TicketsConfidentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly confidentialLoader: TicketConfidentialConfigurationLoader,
    private readonly safeLoggingLoader: TicketSafeLoggingConfigurationLoader,
    private readonly archiveLoader: TicketArchiveConfigurationLoader,
  ) {}

  requestBreakGlass(
    ticketId: string,
    reason: string,
    context: TicketMutationContext,
  ): Promise<BreakGlassResponse> {
    return executeTicketOperation(async () => {
      const gated = await withTicketAccessPolicies(context, {
        confidential: this.confidentialLoader,
        safeLogging: this.safeLoggingLoader,
        archive: this.archiveLoader,
      });
      return requestConfidentialBreakGlass(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        reason,
        gated,
        gated.confidential,
      );
    });
  }
}
