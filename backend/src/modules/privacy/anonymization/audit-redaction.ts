import type { PrismaService } from '../../../common/prisma/prisma.service';
import { appendAuditLog } from '../../audit-log/append-audit-log';
import { auditHashVersions } from '../../audit-log/build-canonical-audit-payload';
import { computeAuditLogHash } from '../../audit-log/compute-audit-log-hash';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { TextScrubber } from './text-scrubber';

const entriesListed = 2000;
const batch = 500;

export type AuditRedactionResult = { readonly redacted: number; readonly sealed: number };

/**
 * Paket 2.6 (§6.5): audit metadata that names the person is scrubbed and the
 * row is marked `redactedAt`. v2 rows still verify fully (the hash covers the
 * digest); v1 rows become "sealed" (link verified, content not). One
 * `audit.redacted` entry in the same chain lists the ids and original hashes.
 * Ids (`actorUserId`, `entityId`) stay — the person behind them is anonymized.
 */
export async function redactAuditForSubject(
  prisma: PrismaService,
  input: {
    readonly userId: string;
    readonly email: string;
    readonly ticketIds: readonly string[];
    readonly scrubber: TextScrubber;
    readonly erasureId: string;
    readonly actorUserId: string | null;
  },
): Promise<AuditRedactionResult> {
  const needle = input.email.toLowerCase();
  const entityIds = [input.userId, ...input.ticketIds];
  const redactedAt = new Date();
  const entries: { id: string; hash: string; v: number }[] = [];
  let redacted = 0;
  let sealed = 0;
  let cursor = '';
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; hash: string; hashVersion: number; metadata: unknown }[]>`
      SELECT "id", "hash", "hashVersion", "metadata"
      FROM "AuditLog"
      WHERE "id" > ${cursor}
        AND "metadata" IS NOT NULL
        AND (
          "actorUserId" = ${input.userId}
          OR "entityId" = ANY(${entityIds}::text[])
          OR position(${needle} in lower("metadata"::text)) > 0
        )
      ORDER BY "id"
      LIMIT ${batch}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      const result = input.scrubber.scrubJson(row.metadata);
      if (result.count === 0) continue;
      await prisma.auditLog.update({
        where: { id: row.id },
        data: { metadata: result.value as never, redactedAt },
      });
      redacted += 1;
      if (row.hashVersion !== 2) sealed += 1;
      if (entries.length < entriesListed) entries.push({ id: row.id, hash: row.hash, v: row.hashVersion });
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < batch) break;
  }
  if (redacted > 0) {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${871_001})`;
      const chain = await transaction.auditLog.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      let previousHash = chain[0]?.previousHash ?? '0'.repeat(64);
      for (const row of chain) {
        if (row.hashVersion === auditHashVersions.v4) {
          const hash = computeAuditLogHash({
            previousHash,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId,
            metadata: {},
            actorUserId: row.actorUserId,
            requestId: row.requestId,
            organizationalUnitId: row.organizationalUnitId,
            hashAlgorithm: row.hashAlgorithm as 'sha256' | 'sha384' | 'sha512',
            hashVersion: auditHashVersions.v4,
            metadataDigest: row.metadataDigest,
            rowId: row.id,
            createdAt: row.createdAt,
            redactedAt: row.redactedAt,
          });
          await transaction.auditLog.update({ where: { id: row.id }, data: { previousHash, hash } });
          previousHash = hash;
        } else {
          previousHash = row.hash;
        }
      }
      await appendAuditLog(transaction as never, {
        action: auditLogActions.auditRedacted,
        entityType: auditLogEntityTypes.privacyErasure,
        entityId: input.erasureId,
        metadata: { redacted, sealed, entries, entriesTruncated: redacted > entries.length },
        actorUserId: input.actorUserId,
      });
    });
  }
  return { redacted, sealed };
}
