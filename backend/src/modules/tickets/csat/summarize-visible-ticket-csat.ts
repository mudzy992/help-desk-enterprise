import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { listTickets } from '../list-tickets';
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
  const tickets = await listTickets(
    input.prisma,
    input.authorizationContextLoader,
    { includeArchived: true },
    input.context,
    input.archive,
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
