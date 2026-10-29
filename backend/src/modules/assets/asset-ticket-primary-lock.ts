import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Acquire the primary-link serialization locks in stable database order before
 * reading the current TicketAsset set. The database trigger repeats the lock
 * for direct SQL writers; application callers need this earlier lock so their
 * count/primary decision is made from the serialized state.
 */
export async function lockTicketAssetPrimaryGroups(
  transaction: Pick<PrismaService, '$queryRaw'>,
  ticketIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const ids = [...new Set(ticketIds.filter((ticketId) => ticketId.length > 0))];
  if (ids.length === 0) return new Set();

  const tickets = await transaction.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Ticket"
    WHERE "id" = ANY(${ids}::text[])
    ORDER BY "id"
    FOR UPDATE`;
  return new Set(tickets.map((ticket) => ticket.id));
}
