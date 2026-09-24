import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { listTicketsWithin } from '../list-tickets';
import { csatSummaryTicketLimit } from './csat.constants';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { aggregateTicketCsat } from './aggregate-ticket-csat';
import type { TicketCsatRecord, TicketCsatSummary } from './csat.types';
import { loadTicketCsatSubmissions } from './load-ticket-csat-submissions';
import type { TicketArchiveConfiguration } from '../archive/archive.types';

export async function summarizeVisibleTicketCsat(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly context: TicketMutationContext;
  readonly archive: TicketArchiveConfiguration;
}): Promise<TicketCsatSummary> {
  // Phase 1.1: only tickets that actually have a submission can contribute a
  // row, and the read is capped, so the summary no longer lists the table.
  const tickets = await listTicketsWithin(
    input.prisma,
    input.authorizationContextLoader,
    { includeArchived: true, hasCsatSubmission: true },
    input.context,
    input.archive,
    csatSummaryTicketLimit,
  );
  const submissions = await loadTicketCsatSubmissions(
    input.prisma,
    tickets.map((ticket) => ticket.id),
  );
  const rows: { ticket: TicketRecord; submission: TicketCsatRecord }[] = [];
  for (const ticket of tickets) {
    const submission = submissions.get(ticket.id);
    if (submission !== undefined) {
      rows.push({ ticket, submission });
    }
  }
  return aggregateTicketCsat(rows);
}
