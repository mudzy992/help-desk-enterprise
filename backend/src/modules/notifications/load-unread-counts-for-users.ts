import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Phase 2.3 (plan §2.3): the badge of every recipient of one event in a single
 * `GROUP BY`.
 *
 * The fan-out used to ask for the count once per recipient; with a 200-member
 * group that was 200 extra queries per message. The users the caller asks about
 * always have a fresh row (the event that triggered them just inserted it), so
 * the result is the badge *after* the event for each of them.
 */
export async function loadUnreadCountsForUsers(
  prisma: PrismaService,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await prisma.notification.groupBy({
    by: ['userId'],
    where: { userId: { in: unique }, isRead: false },
    _count: { _all: true },
  });
  return new Map(
    (rows as readonly {
      readonly userId: string;
      readonly _count: { readonly _all: number };
    }[]).map((row) => [row.userId, row._count._all]),
  );
}
