import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { nonMergeableTicketStatuses, ticketMergeConstants } from './merge.constants';

export type MergeCandidate = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly requesterName: string | null;
  readonly createdAt: string;
};

/**
 * Package 1.2, M5 — tickets this one can be merged into, for the dialog:
 * search by number or title, pre-filtered by rule M1 (not merged, not closed
 * or archived, same confidentiality) and limited to tickets the actor handles
 * as staff. The route is `/tickets/:id/merge-candidates` (the source ticket is
 * needed for the rules, and it keeps clear of `GET /tickets/:id`).
 */
export async function listMergeCandidates(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly ticketId: string;
  readonly query: string | undefined;
  readonly context: TicketMutationContext;
}): Promise<readonly MergeCandidate[]> {
  const { ticket: source, access } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
  );
  if (access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  const q = (input.query ?? '').trim();
  if (q.length < 2) {
    return [];
  }
  const rows = await input.prisma.ticket.findMany({
    where: {
      id: { not: source.id },
      mergedIntoTicketId: null,
      status: { notIn: [...nonMergeableTicketStatuses] },
      isConfidential: source.isConfidential,
      OR: [
        { ticketNumber: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: ticketMergeConstants.maximumCandidates * 2,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      createdAt: true,
      requester: { select: { displayName: true } },
    },
  });
  const result: MergeCandidate[] = [];
  for (const row of rows) {
    if (result.length >= ticketMergeConstants.maximumCandidates) {
      break;
    }
    if (!(await isStaffVisible(input, row.id))) {
      continue;
    }
    result.push({
      id: row.id,
      ticketNumber: row.ticketNumber,
      title: row.title,
      status: row.status,
      requesterName: row.requester?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return result;
}

async function isStaffVisible(
  input: {
    readonly prisma: PrismaService;
    readonly authorizationContextLoader: AuthorizationContextLoader;
    readonly context: TicketMutationContext;
  },
  ticketId: string,
): Promise<boolean> {
  try {
    const { access } = await loadAccessibleTicket(
      input.prisma,
      input.authorizationContextLoader,
      ticketId,
      input.context,
    );
    return access.visibility === 'staff';
  } catch (error) {
    if (error instanceof TicketsError) {
      return false;
    }
    throw error;
  }
}
