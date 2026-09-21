import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';

/**
 * Error for a claim that lost to somebody else. Only call it once the actor
 * has passed the claim authorization checks, because it discloses who holds
 * the ticket.
 */
export async function buildClaimConflictError(
  prisma: PrismaService,
  claimedByUserId: string,
): Promise<TicketsError> {
  const user = await prisma.user.findUnique({
    where: { id: claimedByUserId },
    select: { displayName: true },
  });
  const name =
    typeof user?.displayName === 'string' && user.displayName.length > 0
      ? user.displayName
      : null;
  return new TicketsError('TICKET_NOT_CLAIMABLE', undefined, {
    claimedByName: name,
  });
}

/**
 * The conditional claim write matched no row, so the ticket changed between
 * the read and the write. Re-read to give the caller an accurate outcome: the
 * same actor already holds it (idempotent), somebody else does (conflict with
 * their name), or it is no longer claimable for another reason.
 */
export async function resolveLostClaim(
  prisma: PrismaService,
  ticketId: string,
  actorUserId: string,
): Promise<TicketRecord> {
  const latest = (await prisma.ticket.findUnique({
    where: { id: ticketId },
  })) as TicketRecord | null;
  if (latest === null) {
    throw new TicketsError('NOT_FOUND');
  }
  if (latest.assignedUserId === actorUserId) {
    return latest;
  }
  if (latest.assignedUserId !== null) {
    throw await buildClaimConflictError(prisma, latest.assignedUserId);
  }
  throw new TicketsError('TICKET_NOT_CLAIMABLE');
}
