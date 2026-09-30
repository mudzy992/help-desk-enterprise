import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { AssetAccessService } from '../modules/assets/asset-access.service';
import { AssetError } from '../modules/assets/assets.constants';
import { AssetDirectorySyncService, type DirectorySyncReport } from '../modules/assets/directory/asset-directory-sync.service';
import { DirectoryBackoff } from '../modules/directory-sync/ldaps/directory-backoff';
import { LdapsSyncConfigurationLoader } from '../modules/directory-sync/ldaps/ldaps-sync-configuration.loader';
import { applicationSettings } from '../modules/settings/definitions/application-settings';
import { createSettingsRegistry } from '../modules/settings/registry/create-settings-registry';
import { SettingsService } from '../modules/settings/settings.service';

/*
  Paket 3.2 (§12): AD computers → CMDB from the server. First step of the
  activation is always the dry run (works while the sync is still off):

    docker exec -i "$BACKEND" node dist/src/cli/assets-directory-sync.js --dry-run [--verbose]
    docker exec -i "$BACKEND" node dist/src/cli/assets-directory-sync.js --apply --reason "prvi sync"

  Same service as the scheduled job and the admin UI. Exit codes: 0 ok,
  1 failure, 2 usage, 3 finished with conflicts, skipped computers or a
  tripped missing-guard (review the report).
*/

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value !== undefined && !value.startsWith('--') ? value : null;
}

function print(report: DirectorySyncReport, verbose: boolean) {
  console.log(`${report.dryRun ? 'DRY RUN — nothing written' : 'APPLIED'} (DC ${report.domainController ?? '-'}, ${report.durationMs} ms)`);
  console.log(`Totals: ${JSON.stringify(report.totals)}`);
  if (report.applied) console.log(`Written: ${JSON.stringify(report.applied)}`);
  if (report.missingGuardTripped) {
    console.log(`Missing-guard tripped: ${report.wouldFlagMissing} computers would be flagged "not in AD" — nothing flagged. Check the base DN / filter.`);
  }
  for (const conflict of report.conflicts.slice(0, verbose ? 200 : 20)) {
    console.log(`  conflict: ${conflict.name} — assigned ${conflict.assignedUser ?? conflict.assignedUserId}, AD suggests ${conflict.suggestedUser ?? conflict.suggestedUserId} (${conflict.matchedBy})`);
  }
  for (const skip of report.skipped.slice(0, verbose ? 200 : 20)) console.log(`  skipped: ${skip.name} (${skip.reason})`);
  if (verbose) for (const item of report.preview) console.log(`  ${item.action}: ${item.name}${item.changes.length ? ` [${item.changes.join(', ')}]` : ''}`);
}

async function main(): Promise<number> {
  const dryRun = hasFlag('dry-run');
  const apply = hasFlag('apply');
  const reason = readArgument('reason');
  if (dryRun === apply || (apply && (!reason || reason.trim().length < 5))) {
    console.error('Usage: assets-directory-sync --dry-run [--verbose] | --apply --reason "<at least 5 characters>" [--verbose]');
    return 2;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const prisma = client as unknown as PrismaService;
  const settings = new SettingsService(createSettingsRegistry(applicationSettings), prisma);
  const service = new AssetDirectorySyncService(prisma, new AssetAccessService(prisma, settings), new LdapsSyncConfigurationLoader(settings), new DirectoryBackoff());
  try {
    const report = await service.run({ dryRun, actorUserId: null, trigger: 'cli', ...(reason ? { reason: reason.trim() } : {}) });
    if (apply) console.log(`Reason: ${reason?.trim()}`);
    print(report, hasFlag('verbose'));
    return report.conflicts.length > 0 || report.skipped.length > 0 || report.missingGuardTripped ? 3 : 0;
  } catch (error) {
    if (error instanceof AssetError) {
      console.error(`${error.code}${error.detail ? `: ${error.detail}` : ''}`);
      return 1;
    }
    throw error;
  } finally {
    await client.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
