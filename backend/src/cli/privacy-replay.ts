import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { InboundRawStore } from '../modules/inbound-email/inbound-raw-store';
import { AnonymizationService } from '../modules/privacy/anonymization/anonymization.service';
import { ErasureLedger, type ErasureLedgerEntry } from '../modules/privacy/anonymization/erasure-ledger';
import { readTombstoneKey } from '../modules/privacy/anonymization/tombstones';
import { DiskTicketAttachmentStorage } from '../modules/tickets/attachments/disk-ticket-attachment-storage';
import { resolveUploadRoot } from '../modules/tickets/attachments/resolve-upload-root';

/*
  Paket 2.6 (§12): re-applies anonymizations after a database restore.

  The ledger (uploads volume, privacy-ledger/erasures.jsonl) survives a DB
  restore; every entry whose user is not anonymized in the restored database
  is executed again with the same pseudonym.

    docker exec -i <backend> node dist/src/cli/privacy-replay.js            # dry run (default)
    docker exec -i <backend> node dist/src/cli/privacy-replay.js --apply    # execute
    docker exec -i <backend> node dist/src/cli/privacy-replay.js --export-ledger
        # appends COMPLETED erasures from the DB that are missing in the ledger

  Exit code 0 = nothing left to do (or everything applied), 2 = some entries
  failed or were blocked (see the output).
*/

export type ReplayDecision = 'replay' | 'already_anonymized' | 'user_missing';

export function decideReplay(user: { anonymizedAt: Date | null } | null): ReplayDecision {
  if (user === null) return 'user_missing';
  return user.anonymizedAt === null ? 'replay' : 'already_anonymized';
}

export async function runPrivacyReplay(
  prisma: PrismaClient,
  ledger: ErasureLedger,
  options: { readonly apply: boolean; readonly exportLedger: boolean },
  log: (line: string) => void = console.log,
): Promise<number> {
  const { apply, exportLedger } = options;
  {
    const { entries, invalidLines } = await ledger.read();
    log(`ledger=${ledger.location} entries=${entries.length} invalid_lines=${invalidLines}`);

    if (exportLedger) {
      const known = new Set(entries.map((entry) => entry.erasureId));
      const rows = await prisma.privacyErasure.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'asc' },
        select: {
          id: true,
          userId: true,
          pseudonym: true,
          tombstones: true,
          deleteOwnAttachments: true,
          requestedByUserId: true,
          completedAt: true,
        },
      });
      let added = 0;
      for (const row of rows) {
        if (known.has(row.id)) continue;
        await ledger.append({
          v: 1,
          erasureId: row.id,
          userId: row.userId,
          pseudonym: row.pseudonym,
          tombstones: row.tombstones,
          deleteOwnAttachments: row.deleteOwnAttachments,
          requestedByUserId: row.requestedByUserId,
          completedAt: (row.completedAt ?? new Date()).toISOString(),
        });
        added += 1;
      }
      log(`export_ledger added=${added}`);
      return 0;
    }

    // The last entry per user wins (a user is anonymized at most once).
    const byUser = new Map<string, ErasureLedgerEntry>();
    for (const entry of entries) byUser.set(entry.userId, entry);
    const todo: ErasureLedgerEntry[] = [];
    for (const entry of byUser.values()) {
      const user = await prisma.user.findUnique({ where: { id: entry.userId }, select: { anonymizedAt: true } });
      const decision = decideReplay(user);
      log(`${decision} erasure=${entry.erasureId} user=${entry.userId}`);
      if (decision === 'replay') todo.push(entry);
    }
    log(`to_replay=${todo.length}${apply ? '' : ' (dry run; add --apply to execute)'}`);
    if (!apply || todo.length === 0) return 0;
    if (readTombstoneKey() === null) {
      log('PRIVACY_TOMBSTONE_KEY (or MFA_ENCRYPTION_KEY) is required');
      return 1;
    }

    // No ledger here: replayed entries are already in the file.
    const service = new AnonymizationService(
      prisma as unknown as PrismaService,
      { load: async () => ({}) } as never,
      new DiskTicketAttachmentStorage(resolveUploadRoot()),
      new InboundRawStore(),
    );
    let failed = 0;
    for (const entry of todo) {
      await prisma.privacyErasure.upsert({
        where: { id: entry.erasureId },
        create: {
          id: entry.erasureId,
          userId: entry.userId,
          pseudonym: entry.pseudonym,
          status: 'QUEUED',
          deleteOwnAttachments: entry.deleteOwnAttachments,
          requestedByUserId: entry.requestedByUserId,
        },
        update: { status: 'QUEUED', startedAt: null, error: null },
      });
      const result = await service.execute(entry.erasureId);
      log(`applied erasure=${entry.erasureId} status=${result?.status ?? 'SKIPPED'}${result?.error ? ` error=${result.error}` : ''}`);
      if (result?.status !== 'COMPLETED') failed += 1;
    }
    return failed === 0 ? 0 : 2;
  }
}

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 1;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    return await runPrivacyReplay(prisma, new ErasureLedger(), {
      apply: process.argv.includes('--apply'),
      exportLedger: process.argv.includes('--export-ledger'),
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
