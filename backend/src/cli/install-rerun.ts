import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { applicationSettings } from '../modules/settings/definitions/application-settings';
import { createSettingsRegistry } from '../modules/settings/registry/create-settings-registry';
import { persistSettingValues } from '../modules/settings/persist-setting-value';
import { installRerunEnvironmentKey } from '../modules/install/install-rerun.constants';
import { readInstallRerunAllowed } from '../modules/install/read-install-rerun-allowed';
import {
  planInstallRerunClears,
  resolveInstallRerunKeys,
} from '../modules/install/plan-install-rerun';

/*
  Ops-only reopening of a finished installation (owner decision 6), the script
  form of `POST /install/restart`. It clears exactly the keys the route clears
  (one shared plan) through the same validation and change log:

    docker exec -i <backend> node dist/src/cli/install-rerun.js \
      --reason "Ponovno pokretanje instalacije" [--include-step-markers] [--dry-run]

  `INSTALL_ALLOW_RERUN=true` is required, exactly as for the route. `--dry-run`
  prints the keys and writes nothing.
*/

const usage =
  'Usage: install-rerun --reason "<why the wizard is being reopened>" [--include-step-markers] [--dry-run]';

export type InstallRerunCliInput = {
  readonly reason: string;
  readonly includeStepMarkers: boolean;
  readonly dryRun: boolean;
};

/** Arguments and switches in one place, so the rules above are testable. */
export function readInstallRerunCliInput(
  argv: readonly string[],
  environment: NodeJS.Dict<string>,
): InstallRerunCliInput {
  if (!readInstallRerunAllowed(environment)) {
    throw new Error(
      `${installRerunEnvironmentKey}=true is required to reopen a finished installation (ops only)`,
    );
  }
  const index = argv.indexOf('--reason');
  const reason = index >= 0 ? argv[index + 1] : undefined;
  if (!reason || reason.startsWith('--') || reason.trim().length < 3) {
    throw new Error(usage);
  }
  return {
    reason: reason.trim(),
    includeStepMarkers: argv.includes('--include-step-markers'),
    dryRun: argv.includes('--dry-run'),
  };
}

async function main(): Promise<number> {
  let input: InstallRerunCliInput;
  try {
    input = readInstallRerunCliInput(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const registry = createSettingsRegistry(applicationSettings);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const keys = resolveInstallRerunKeys({
      includeStepMarkers: input.includeStepMarkers,
    });
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, value: true },
    });
    // The stored rows are the whole input: a row that is not there is an unset
    // key, which the shared plan already treats as „at its default“.
    const currentByKey = new Map<string, unknown>(rows.map((row) => [row.key, row.value] as const));
    const clears = planInstallRerunClears({
      registry,
      currentByKey,
      includeStepMarkers: input.includeStepMarkers,
    });
    if (clears.length === 0) {
      console.log('Nothing to clear: the wizard is already open.');
      return 0;
    }
    for (const clear of clears) {
      console.log(
        `${input.dryRun ? '[dry-run] ' : ''}${clear.definition.key} -> ${JSON.stringify(clear.value)}`,
      );
    }
    if (input.dryRun) {
      console.log(`${clears.length} key(s) would be cleared; nothing written.`);
      return 0;
    }
    await persistSettingValues(prisma as unknown as PrismaService, registry, clears, {
      reason: input.reason,
      actorUserId: null,
    });
    console.log(`${clears.length} key(s) cleared; the wizard is open again.`);
    console.log(
      'Open /install and unlock it with INSTALL_TOKEN; the rest of the product answers SETUP_REQUIRED until then.',
    );
    return 0;
  } finally {
    await prisma.$disconnect();
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
