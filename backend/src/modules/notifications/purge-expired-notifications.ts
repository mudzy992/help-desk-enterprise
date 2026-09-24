import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationRetentionBatchSize } from './notification-retention.constants';

/**
 * Phase 2.3 (plan §2.3, item 2): deletes notifications older than the retention
 * window, in batches, until nothing is left to delete.
 *
 * `deleteMany` has no `LIMIT` in Prisma, so each round reads the ids of one
 * batch and deletes exactly those — the loop is bounded by the amount of old
 * data, and each statement stays short. Returns how many rows were removed so
 * the job can log it.
 */
export async function purgeExpiredNotifications(
  prisma: PrismaService,
  input: {
    readonly now?: Date;
    readonly retentionDays: number;
    readonly batchSize?: number;
  },
): Promise<number> {
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? notificationRetentionBatchSize;
  const cutoff = new Date(
    now.getTime() - input.retentionDays * 24 * 60 * 60 * 1000,
  );
  let deleted = 0;
  for (;;) {
    const batch = (await prisma.notification.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: batchSize,
    })) as readonly { readonly id: string }[];
    if (batch.length === 0) {
      return deleted;
    }
    const result = await prisma.notification.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });
    deleted += result.count;
    if (batch.length < batchSize) {
      return deleted;
    }
  }
}
