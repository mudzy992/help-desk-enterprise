import { Prisma } from "../../../generated/prisma/client";
import type { PrismaClient } from "../../../generated/prisma/client";
import { purgePendingAssetTransferFiles } from "../../assets/transfers/purge-asset-transfer-files";
import type { TicketAttachmentStorage } from "../../tickets/attachments/attachments.types";
import type { RetentionCategory } from "../privacy.constants";
import { retentionRedactionMarker } from "./retention-markers";

const category: RetentionCategory = "assetTransfers";
const batchSize = 100;

const redactedParty = {
  userId: null,
  name: retentionRedactionMarker,
  title: "",
  unit: "",
  email: "",
} as const;

type TransferRetentionAggregate = {
  readonly count: bigint;
  readonly bytes: bigint;
  readonly oldestAt: Date | null;
  readonly newestAt: Date | null;
};

type TransferRetentionCandidate = {
  readonly id: string;
  readonly number: string;
  readonly scenario: "WAREHOUSE_TO_USER" | "USER_TO_USER" | "USER_TO_WAREHOUSE";
  readonly issuedAt: Date;
  readonly terminalAt: Date;
  readonly signedStoragePath: string | null;
  readonly signedSizeBytes: number | null;
  readonly signedFilePurgeRequestedAt: Date | null;
};

/** Due only after a terminal outcome, and never while any recorded party is on legal hold. */
function eligibleTransferSql(cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    "retentionRedactedAt" IS NULL
    AND (
      ("status" = 'SIGNED' AND "signedAt" IS NOT NULL AND "signedAt" < ${cutoff})
      OR
      ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledAt" < ${cutoff})
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "User" AS "heldParty"
      WHERE "heldParty"."legalHoldAt" IS NOT NULL
        AND "heldParty"."id" IN (
          "AssetTransfer"."fromUserId",
          "AssetTransfer"."toUserId",
          "AssetTransfer"."signatoryUserId",
          "AssetTransfer"."issuedByUserId",
          "AssetTransfer"."signedByUserId",
          "AssetTransfer"."cancelledByUserId"
        )
    )
  `;
}

function redactedSnapshot(
  row: TransferRetentionCandidate,
): Prisma.InputJsonValue {
  return {
    version: 1,
    locale: "bs",
    number: row.number,
    scenario: row.scenario,
    issuedAt: row.issuedAt.toISOString(),
    timeZone: "UTC",
    place: "",
    from: redactedParty,
    to: redactedParty,
    signatory: redactedParty,
    issuedBy: redactedParty,
    note: retentionRedactionMarker,
    items: [],
  } as Prisma.InputJsonValue;
}

/**
 * W7.14: redact transfer PII while retaining the minimal record shell and item
 * count. Signed files are made unavailable by a durable marker before a
 * bounded, retryable filesystem purge.
 */
export function createAssetTransferRetentionExecutor(
  prisma: PrismaClient,
  storage: TicketAttachmentStorage,
): {
  readonly category: RetentionCategory;
  preview(
    cutoff: Date,
  ): Promise<import("./retention-executors").RetentionPreview>;
  executeBatch(
    cutoff: Date,
  ): Promise<import("./retention-executors").RetentionBatch>;
} {
  async function preview(cutoff: Date) {
    const rows = await prisma.$queryRaw<TransferRetentionAggregate[]>`
      SELECT
        COUNT(*)::bigint AS "count",
        COALESCE(SUM(CASE WHEN "signedStoragePath" IS NOT NULL THEN COALESCE("signedSizeBytes", 0) ELSE 0 END), 0)::bigint AS "bytes",
        MIN(CASE WHEN "status" = 'SIGNED' THEN "signedAt" ELSE "cancelledAt" END) AS "oldestAt",
        MAX(CASE WHEN "status" = 'SIGNED' THEN "signedAt" ELSE "cancelledAt" END) AS "newestAt"
      FROM "AssetTransfer"
      WHERE ${eligibleTransferSql(cutoff)}
    `;
    const row = rows[0];
    return {
      count: Number(row?.count ?? 0n),
      bytes: row?.bytes ?? 0n,
      oldestAt: row?.oldestAt ?? null,
      newestAt: row?.newestAt ?? null,
    };
  }

  async function executeBatch(cutoff: Date) {
    const candidates = await prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<TransferRetentionCandidate[]>`
        SELECT
          "id",
          "number",
          "scenario"::text AS "scenario",
          "issuedAt",
          CASE WHEN "status" = 'SIGNED' THEN "signedAt" ELSE "cancelledAt" END AS "terminalAt",
          "signedStoragePath",
          "signedSizeBytes",
          "signedFilePurgeRequestedAt"
        FROM "AssetTransfer"
        WHERE ${eligibleTransferSql(cutoff)}
        ORDER BY CASE WHEN "status" = 'SIGNED' THEN "signedAt" ELSE "cancelledAt" END ASC, "id" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return rows;
      const now = new Date();
      for (const row of rows) {
        await transaction.assetTransfer.update({
          where: { id: row.id },
          data: {
            snapshot: redactedSnapshot(row),
            fromUserId: null,
            fromLabel: null,
            toUserId: null,
            toLabel: null,
            signatoryUserId: null,
            issuedByUserId: null,
            signedByUserId: null,
            cancelledByUserId: null,
            note: null,
            cancelReason: null,
            templateId: null,
            signedFileName: null,
            signedMimeType: null,
            signedSizeBytes:
              row.signedStoragePath === null ? null : row.signedSizeBytes,
            signedFilePurgeRequestedAt:
              row.signedFilePurgeRequestedAt ??
              (row.signedStoragePath === null ? null : now),
            retentionRedactedAt: now,
          },
        });
        await transaction.assetTransferItem.updateMany({
          where: { transferId: row.id },
          data: { assetId: null },
        });
      }
      return rows;
    });

    // Purge only this terminal batch; the independent maintenance retry handles
    // anonymization markers and any files queued by an earlier failed batch.
    const purge = await purgePendingAssetTransferFiles(prisma, storage, {
      limit: batchSize,
      transferIds: candidates.map((row) => row.id),
    });
    const dueRemainingRows = await prisma.$queryRaw<
      { readonly count: bigint }[]
    >`
      SELECT COUNT(*)::bigint AS "count"
      FROM "AssetTransfer"
      WHERE ${eligibleTransferSql(cutoff)}
    `;
    const dueRemaining = Number(dueRemainingRows[0]?.count ?? 0n);
    const blockedOnConcurrentWork = candidates.length === 0 && dueRemaining > 0;
    const purgeLocked =
      purge.remaining > 0 && purge.attempted === 0 && purge.failures === 0;
    const failures =
      purge.failures + (blockedOnConcurrentWork || purgeLocked ? 1 : 0);
    const done = failures > 0 || (dueRemaining === 0 && purge.remaining === 0);

    return {
      items: candidates.length,
      bytes: purge.bytesFreed,
      refs: candidates.map((row) => row.number),
      oldestAt: candidates.reduce<Date | null>(
        (value, row) =>
          value === null || row.terminalAt < value ? row.terminalAt : value,
        null,
      ),
      newestAt: candidates.reduce<Date | null>(
        (value, row) =>
          value === null || row.terminalAt > value ? row.terminalAt : value,
        null,
      ),
      done,
      failures,
    };
  }

  return { category, preview, executeBatch };
}
