import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { executeTicketOperation } from '../execute-ticket-operation';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import type { TicketMutationContext } from '../tickets.types';
import { exportTicketsCsv } from './export-tickets';
import type { ExportTicketsQuery, TicketsExportResult } from './export.types';

@Injectable()
export class TicketsExportService {
  private readonly logger = new Logger(TicketsExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
  ) {}

  async exportCsv(
    query: ExportTicketsQuery,
    context: TicketMutationContext,
    requestId: string | null,
  ): Promise<TicketsExportResult> {
    try {
      return await executeTicketOperation(async () =>
        exportTicketsCsv({
          prisma: this.prisma,
          authorizationContextLoader: this.authorizationContextLoader,
          query,
          context: await this.accessPolicies.bind(context),
          requestId,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Ticket CSV export failed requestId=${requestId ?? 'unknown'}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
