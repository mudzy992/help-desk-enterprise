import { Prisma } from "../../../generated/prisma/client";
import type { PrismaClient } from "../../../generated/prisma/client";
import type { TicketAttachmentStorage } from "../../tickets/attachments/attachments.types";

export type AssetTransferFilePurgeResult = {
  readonly attempted: number;
  readonly purged: number;
  readonly bytesFreed: bigint;
  readonly failures: number;
  readonly remaining: number;
  readonly refs: readonly string[];
};

type PendingSignedFile = {
  readonly id: string;
  readonly number: string;
  readonly signedStoragePath: string;
  readonly signedSizeBytes: number | null;
};

/**
 * Idempotent, bounded cleanup for erasure/retention requests. A database row
 * lock serializes workers; the marker remains set until the file is removed
 * and its path/metadata are cleared. Missing files are treated as removed by
 * the storage contract, so a crash after unlink is safe to retry.
 */
export async function purgePendingAssetTransferFiles(
  prisma: PrismaClient,
  storage: TicketAttachmentStorage,
  options: {
    readonly limit?: number;
    readonly transferIds?: readonly string[];
  } = {},
): Promise<AssetTransferFilePurgeResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
  const transferIds = options.transferIds;
  if (transferIds !== undefined && transferIds.length === 0) {
    return {
      attempted: 0,
      purged: 0,
      bytesFreed: 0n,
      failures: 0,
      remaining: 0,
      refs: [],
    };
  }

  let attempted = 0;
  let purged = 0;
  let bytesFreed = 0n;
  let failures = 0;
  const refs: string[] = [];
  for (let index = 0; index < limit; index += 1) {
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const idFilter =
          transferIds === undefined
            ? Prisma.empty
            : Prisma.sql`AND "id" IN (${Prisma.join(transferIds)})`;
        const rows = await transaction.$queryRaw<PendingSignedFile[]>`
          SELECT "id", "number", "signedStoragePath", "signedSizeBytes"
          FROM "AssetTransfer"
          WHERE "signedFilePurgeRequestedAt" IS NOT NULL
            AND "signedStoragePath" IS NOT NULL
            ${idFilter}
          ORDER BY "signedFilePurgeRequestedAt" ASC, "id" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;
        const pending = rows[0];
        if (pending === undefined) return { row: null, failed: false };
        try {
          await storage.remove(pending.signedStoragePath);
        } catch {
          return { row: pending, failed: true };
        }
        await transaction.assetTransfer.updateMany({
          where: {
            id: pending.id,
            signedStoragePath: pending.signedStoragePath,
            signedFilePurgeRequestedAt: { not: null },
          },
          data: {
            signedStoragePath: null,
            signedFileName: null,
            signedMimeType: null,
            signedSizeBytes: null,
          },
        });
        return { row: pending, failed: false };
      });
      if (result.row === null) break;
      attempted += 1;
      if (result.failed) {
        failures += 1;
        // Do not hot-loop on an unavailable storage backend; maintenance retries later.
        break;
      }
      purged += 1;
      bytesFreed += BigInt(result.row.signedSizeBytes ?? 0);
      refs.push(result.row.number);
    } catch {
      failures += 1;
      // A transaction/DB error should also be retried by the next maintenance pass.
      break;
    }
  }

  const remaining = await prisma.assetTransfer.count({
    where: {
      signedFilePurgeRequestedAt: { not: null },
      signedStoragePath: { not: null },
      ...(transferIds === undefined ? {} : { id: { in: [...transferIds] } }),
    },
  });
  return { attempted, purged, bytesFreed, failures, remaining, refs };
}
