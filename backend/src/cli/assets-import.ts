import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { auditLogEntityTypes } from '../modules/audit-log/audit-log.constants';
import { recordAuditEntry } from '../modules/audit-log/record-audit-entry';
import type { AssetAccessService } from '../modules/assets/asset-access.service';
import { AssetError } from '../modules/assets/assets.constants';
import type { AssetsService } from '../modules/assets/assets.service';
import { AssetImportService } from '../modules/assets/import/asset-import.service';

/*
  Paket 3.2 (§11): initial mass import on the server, same code as the UI.
  The file comes over stdin, so nothing has to be copied into the container:

    docker exec -i "$BACKEND" node dist/src/cli/assets-import.js \
      --type laptop --file - --name laptopi.xlsx [--mode upsert] [--all-or-nothing] \
      [--mapping '["assetTag","name",null]'] [--dry-run] --reason "početni uvoz" < laptopi.xlsx

  Runs with a global scope and works while the module is still switched off
  (data can wait for the activation). Exit codes: 0 ok, 1 failure, 2 usage,
  3 preview has errors (nothing applied with --all-or-nothing).
*/

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value !== undefined && !value.startsWith('--') ? value : null;
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function readInput(file: string): Promise<Buffer> {
  if (file !== '-') return readFileSync(file);
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function main(): Promise<number> {
  const typeKey = readArgument('type');
  const file = readArgument('file');
  const reason = readArgument('reason');
  const mode = (readArgument('mode') ?? 'create').toLowerCase() === 'upsert' ? 'UPSERT' : 'CREATE_ONLY';
  const dryRun = hasFlag('dry-run');
  if (!typeKey || !file || !reason || reason.trim().length < 5) {
    console.error('Usage: assets-import --type <key> --file <path|-> [--name x.xlsx] [--mode create|upsert] [--all-or-nothing] [--mapping <json>] [--dry-run] --reason "<at least 5 characters>"');
    return 2;
  }
  const fileName = readArgument('name') ?? (file === '-' ? 'stdin.xlsx' : file.split(/[\\/]/).pop() ?? 'import.xlsx');
  const mappingRaw = readArgument('mapping');
  let mapping: (string | null)[] | undefined;
  if (mappingRaw !== null) {
    try {
      mapping = JSON.parse(mappingRaw) as (string | null)[];
    } catch {
      console.error('--mapping must be a JSON array');
      return 2;
    }
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const type = await prisma.assetType.findFirst({ where: { key: typeKey }, select: { id: true } });
    if (type === null) {
      console.error(`Unknown asset type "${typeKey}". Known: ${(await prisma.assetType.findMany({ select: { key: true } })).map((row) => row.key).join(', ')}`);
      return 1;
    }
    // Settings straight from the database (no Redis needed on the command line).
    const access = {
      readSetting: async <T>(key: string, fallback: T): Promise<T> => {
        const row = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
        return row === null || row.value === null ? fallback : (row.value as T);
      },
    } as unknown as AssetAccessService;
    const service = new AssetImportService(prisma as unknown as PrismaService, access, {} as AssetsService);
    const actor = { userId: null, scope: { all: true as const } };
    const buffer = await readInput(file);
    const preview = await service.preview({ fileName, buffer }, { typeId: type.id, mode, allOrNothing: hasFlag('all-or-nothing'), mapping }, actor);
    console.log(`Columns: ${preview.headers.map((header, index) => `${header} → ${preview.mapping[index] ?? '(ignored)'}`).join(' | ')}`);
    console.log(`Preview ${preview.id}: ${JSON.stringify(preview.totals)}`);
    for (const error of preview.errors.slice(0, 30)) {
      console.log(`  row ${error.row}, ${error.column ?? '-'}: ${error.code}${error.value ? ` (${error.value})` : ''}`);
    }
    if (preview.errorCount > 30) console.log(`  … ${preview.errorCount - 30} more errors`);
    if (preview.duplicateOfJobId) console.log(`Same file was already imported (job ${preview.duplicateOfJobId}); new rows are skipped.`);
    if (dryRun) {
      await service.discard(preview.id, actor);
      console.log('Dry run: nothing written.');
      return preview.errorCount > 0 ? 3 : 0;
    }
    if (hasFlag('all-or-nothing') && preview.errorCount > 0) {
      await service.discard(preview.id, actor);
      console.error('All-or-nothing: the file has errors, nothing applied.');
      return 3;
    }
    const result = await service.apply(preview.id, actor);
    await recordAuditEntry(prisma as unknown as PrismaService, {
      action: 'asset.import.cli',
      entityType: auditLogEntityTypes.assetImport,
      entityId: preview.id,
      actorUserId: null,
      metadata: { reason: reason.trim(), fileName, mode, ...result.applied } as never,
    });
    console.log(`Applied: ${JSON.stringify(result.applied)} (status ${result.status})`);
    for (const failure of result.failures.slice(0, 30)) console.log(`  row ${failure.row}: ${failure.code}`);
    return result.status === 'APPLIED' ? (preview.errorCount > 0 ? 3 : 0) : 1;
  } catch (error) {
    if (error instanceof AssetError) {
      console.error(`${error.code}${error.detail ? `: ${error.detail}` : ''}`);
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
