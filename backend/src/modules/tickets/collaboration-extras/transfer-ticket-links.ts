import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Paket 2.4 (D5): on merge the child's "related to" links move to the parent,
 * without duplicates; a link between child and parent disappears. Runs inside
 * the merge transaction.
 */
export async function transferTicketLinks(
  tx: PrismaService,
  childId: string,
  parentId: string,
): Promise<void> {
  // In-memory test harnesses do not model links.
  if ((tx as { ticketLink?: unknown }).ticketLink === undefined) {
    return;
  }
  const links = await tx.ticketLink.findMany({
    where: { OR: [{ ticketAId: childId }, { ticketBId: childId }] },
    select: { id: true, ticketAId: true, ticketBId: true },
  });
  for (const link of links) {
    const otherId = link.ticketAId === childId ? link.ticketBId : link.ticketAId;
    if (otherId === parentId) {
      await tx.ticketLink.delete({ where: { id: link.id } });
      continue;
    }
    const [ticketAId, ticketBId] = parentId < otherId ? [parentId, otherId] : [otherId, parentId];
    const existing = await tx.ticketLink.findFirst({
      where: { ticketAId, ticketBId },
      select: { id: true },
    });
    if (existing === null) {
      await tx.ticketLink.update({ where: { id: link.id }, data: { ticketAId, ticketBId } });
    } else {
      await tx.ticketLink.delete({ where: { id: link.id } });
    }
  }
}
