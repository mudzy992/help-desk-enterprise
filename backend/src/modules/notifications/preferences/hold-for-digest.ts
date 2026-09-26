import type { PrismaService } from '../../../common/prisma/prisma.service';
import { findPreferenceCategoryForType } from './notification-preference-catalog';

export type HeldDigestItem = {
  readonly userId: string;
  readonly type: string;
  readonly reason: 'DIGEST' | 'QUIET';
  readonly ticketId: string | null;
  readonly event: string;
  readonly dedupeKey: string;
};

type DigestItemClient = {
  readonly notificationDigestItem?: {
    createMany(args: unknown): Promise<{ count: number }>;
  };
};

/**
 * Paket 2.2 (N5/N6): one batch insert for every held e-mail of an event. The
 * `(userId, dedupeKey)` key makes a replayed event a no-op. No text is stored:
 * the digest reads the current ticket number/title when it is sent.
 */
export async function holdForDigest(
  prisma: PrismaService,
  items: readonly HeldDigestItem[],
): Promise<number> {
  const delegate = (prisma as unknown as DigestItemClient).notificationDigestItem;
  if (items.length === 0 || delegate === undefined) return 0;
  const result = await delegate.createMany({
    data: items.map((item) => ({
      userId: item.userId,
      category: findPreferenceCategoryForType(item.type)?.key ?? item.type,
      type: item.type,
      reason: item.reason,
      ticketId: item.ticketId,
      event: item.event.slice(0, 64),
      dedupeKey: item.dedupeKey,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
