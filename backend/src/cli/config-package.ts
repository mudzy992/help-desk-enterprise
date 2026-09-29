import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { ConfigVersioningConfigurationLoader } from '../modules/config-versioning/config-versioning-configuration.loader';
import { isConfigVersioningError } from '../modules/config-versioning/config-versioning.error';
import { ConfigVersioningRepository } from '../modules/config-versioning/config-versioning.repository';
import { ConfigPackageService } from '../modules/config-versioning/package/config-package.service';
import type { ConfigPackageImportReport } from '../modules/config-versioning/package/config-package.types';
import { parseConfigPackageMappings } from '../modules/config-versioning/package/parse-import-options';
import { applicationSettings } from '../modules/settings/definitions/application-settings';
import { createSettingsRegistry } from '../modules/settings/registry/create-settings-registry';
import { SettingsService } from '../modules/settings/settings.service';

/*
  Paket 2.9 (K4): config packages from the command line (pipelines, servers
  without the admin UI). Same service as the HTTP API; import only ever
  creates a DRAFT version.

    node dist/src/cli/config-package.js export --version 12 [--include-environment-bound] [--out file.json]
    node dist/src/cli/config-package.js import --file pkg.json [--mappings map.json]
        [--apply-environment-bound] [--confirm-unsigned] [--notes "..."] [--dry-run]

  With docker: `docker exec -i <backend> node dist/src/cli/config-package.js import --dry-run < pkg.json`
  (without --file the package is read from stdin).

  Exit codes: 0 ok, 1 invalid input / package rejected, 2 usage error,
  3 unresolved references (see the report).
*/

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value === undefined || value.startsWith('--') ? undefined : value;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

export function formatImportReport(report: ConfigPackageImportReport): string[] {
  const lines = [
    `source=${report.header.sourceEnvironment || '?'} version=${report.header.sourceVersion} exported=${report.header.exportedAt}`,
    `checksum=ok signature=${report.signature}`,
    `settings: applied=${report.settings.applied.length} env_bound_skipped=${report.settings.skippedEnvironmentBound.length} unknown_skipped=${report.settings.skippedUnknown.length}`,
  ];
  if (report.created.calendars.length || report.created.slaProfiles.length) {
    lines.push(`created: calendars=[${report.created.calendars.join(', ')}] slaProfiles=[${report.created.slaProfiles.join(', ')}]`);
  }
  for (const [kind, keys] of Object.entries(report.skipped)) {
    if (keys.length > 0) lines.push(`skipped ${kind}: ${keys.join(', ')}`);
  }
  for (const item of report.items.filter((entry) => entry.status !== 'resolved')) {
    lines.push(`${item.blocking ? 'BLOCKING ' : ''}${item.status} ${item.kind} "${item.key}" used by ${item.usedBy.join(', ')}`);
  }
  lines.push(`blocking=${report.blockingCount} can_import=${report.canImport}`);
  return lines;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command !== 'export' && command !== 'import') {
    console.error('Usage: config-package export --version <n> | import [--file f] [--dry-run] ...');
    return 2;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const prisma = client as unknown as PrismaService;
  const registry = createSettingsRegistry(applicationSettings);
  const settings = new SettingsService(registry, prisma);
  const service = new ConfigPackageService(
    prisma,
    new ConfigVersioningRepository(prisma),
    settings,
    registry,
    new ConfigVersioningConfigurationLoader(settings),
  );
  try {
    if (command === 'export') {
      const version = Number(readArgument('version'));
      if (!Number.isInteger(version) || version < 1) {
        console.error('--version <n> is required');
        return 2;
      }
      const record = await client.configVersion.findUnique({ where: { version }, select: { id: true } });
      if (record === null) {
        console.error(`Config version ${version} not found`);
        return 1;
      }
      const result = await service.exportPackage(
        record.id,
        { includeEnvironmentBound: hasFlag('include-environment-bound') },
        null,
      );
      const json = `${JSON.stringify(result.body, null, 2)}\n`;
      const out = readArgument('out');
      if (out) {
        await writeFile(out, json, 'utf8');
        console.error(`written ${out} (${result.fileName})`);
      } else {
        process.stdout.write(json);
      }
      return 0;
    }

    const file = readArgument('file');
    const raw: unknown = JSON.parse(file ? await readFile(file, 'utf8') : await readStdin());
    const mappingsFile = readArgument('mappings');
    const options = {
      mappings: parseConfigPackageMappings(mappingsFile ? await readFile(mappingsFile, 'utf8') : undefined),
      applyEnvironmentBound: hasFlag('apply-environment-bound'),
      confirmUnsigned: hasFlag('confirm-unsigned'),
    };
    const report = await service.previewImport(raw, options);
    for (const line of formatImportReport(report)) console.log(line);
    if (!report.canImport) return 3;
    if (hasFlag('dry-run')) {
      console.log('[dry-run] nothing written.');
      return 0;
    }
    const created = await service.importPackage(raw, { ...options, releaseNotes: readArgument('notes') }, null);
    console.log(`created DRAFT version ${created.version} (${created.id}); validate and activate it in the admin UI.`);
    return 0;
  } catch (error) {
    if (isConfigVersioningError(error)) {
      console.error(error.code);
      for (const detail of error.details ?? []) console.error(`  ${detail.path}: ${detail.message}`);
      return 1;
    }
    if (error instanceof SyntaxError) {
      console.error(`Invalid JSON: ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
