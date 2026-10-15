import type { Prisma } from '../../../generated/prisma/client';

/**
 * Paket 3.2 C9: monthly transfer counter. Uses the same INSERT … ON CONFLICT
 * pattern as Problem/Change sequences. Realigns from issued transfers when the
 * counter row lags (common on long-lived E2E tenants after a failed allocator).
 */
export async function allocateAssetTransferSequence(
  transaction: Prisma.TransactionClient,
  year: number,
  month: number,
): Promise<number> {
  const rows = await transaction.$queryRaw<{ lastNumber: number | bigint }[]>`
    INSERT INTO "AssetTransferSequence" ("year", "month", "lastNumber") VALUES (${year}, ${month}, 1)
    ON CONFLICT ("year", "month") DO UPDATE SET "lastNumber" = "AssetTransferSequence"."lastNumber" + 1
    RETURNING "lastNumber"`;
  let sequence = Number(rows[0]?.lastNumber ?? 1);
  const issuedHigh = (
    await transaction.assetTransfer.aggregate({
      where: { year, month },
      _max: { sequence: true },
    })
  )._max.sequence;
  if (issuedHigh !== null && sequence <= issuedHigh) {
    sequence = issuedHigh + 1;
    await transaction.assetTransferSequence.update({
      where: { year_month: { year, month } },
      data: { lastNumber: sequence },
    });
  }
  return sequence;
}
