import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../modules/audit-log/audit-log.constants';
import { recordAuditEntry } from '../modules/audit-log/record-audit-entry';
import {
  decryptLicenseKey,
  encryptLicenseKey,
  needsLicenseRekey,
  readLicenseKeyCipherKey,
  readLicenseKeyDecryptionKeys,
} from '../modules/assets/asset-license-cipher';
import type { PrismaService } from '../common/prisma/prisma.service';

/*
  Paket 4.1 (§5): one-off re-encryption of CMDB licence keys from the v1 to
  the v2 key derivation. Idempotent (rows already on v2 are skipped), safe to
  re-run, and each row is updated only if it did not change meanwhile.

    node dist/src/cli/rekey-asset-licenses.js --dry-run
    node dist/src/cli/rekey-asset-licenses.js
*/

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const current = readLicenseKeyCipherKey();
  if (current === null) {
    console.error('MFA_ENCRYPTION_KEY is missing or invalid - licence keys cannot be re-encrypted');
    return 2;
  }
  const keys = readLicenseKeyDecryptionKeys();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const counts = { checked: 0, current: 0, rekeyed: 0, failed: 0, changed: 0 };
  try {
    const rows = await prisma.softwareLicense.findMany({
      where: { keyEncrypted: { not: null } },
      select: { id: true, keyEncrypted: true },
    });
    for (const row of rows) {
      counts.checked += 1;
      const stored = row.keyEncrypted as string;
      if (!needsLicenseRekey(stored)) {
        counts.current += 1;
        continue;
      }
      let plain: string;
      try {
        plain = decryptLicenseKey(stored, keys);
      } catch {
        counts.failed += 1;
        console.error(`licence ${row.id}: cannot be decrypted with the current or legacy key - left unchanged`);
        continue;
      }
      if (dryRun) {
        counts.rekeyed += 1;
        continue;
      }
      const updated = await prisma.softwareLicense.updateMany({
        where: { id: row.id, keyEncrypted: stored },
        data: { keyEncrypted: encryptLicenseKey(plain, current) },
      });
      if (updated.count === 0) {
        counts.changed += 1;
        continue;
      }
      counts.rekeyed += 1;
      await recordAuditEntry(prisma as unknown as PrismaService, {
        action: auditLogActions.assetLicenseSaved,
        entityType: auditLogEntityTypes.softwareLicense,
        entityId: row.id,
        actorUserId: null,
        metadata: { via: 'rekey-asset-licenses', kdf: 'v2' } as never,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
  const verb = dryRun ? 'would re-encrypt' : 're-encrypted';
  console.log(
    `checked ${counts.checked}: ${counts.current} already v2, ${verb} ${counts.rekeyed}, ` +
      `${counts.changed} changed meanwhile (re-run), ${counts.failed} unreadable`,
  );
  return counts.failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
