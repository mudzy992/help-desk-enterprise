import { PrismaService } from '../../../common/prisma/prisma.service';

type AssetDelegates = { ticketAsset?: unknown };

/**
 * Paket 3.2 (§8): equipment links follow merge and split. Merge copies the
 * child's links to the parent (the child keeps its own, it is read-only);
 * split copies the parent's links to each child. Never marks a copy primary
 * when the target already has a primary link. In-memory harnesses skip.
 */
export async function copyTicketAssets(
  tx: PrismaService,
  fromTicketId: string,
  toTicketId: string,
  actorUserId: string | null,
): Promise<number> {
  if ((tx as unknown as AssetDelegates).ticketAsset === undefined) return 0;
  const source = await tx.ticketAsset.findMany({
    where: { ticketId: fromTicketId },
    select: { assetId: true, isPrimary: true },
  });
  if (source.length === 0) return 0;
  const existing = await tx.ticketAsset.findMany({
    where: { ticketId: toTicketId },
    select: { assetId: true, isPrimary: true },
  });
  const present = new Set(existing.map((row) => row.assetId));
  let hasPrimary = existing.some((row) => row.isPrimary);
  let copied = 0;
  for (const row of source) {
    if (present.has(row.assetId)) continue;
    const isPrimary = row.isPrimary && !hasPrimary;
    hasPrimary ||= isPrimary;
    await tx.ticketAsset.create({
      data: { ticketId: toTicketId, assetId: row.assetId, isPrimary, linkedByUserId: actorUserId },
    });
    copied += 1;
  }
  return copied;
}
