import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { applicationSettings } from '../modules/settings/definitions/application-settings';
import { persistSettingValue } from '../modules/settings/persist-setting-value';
import { createSettingsRegistry } from '../modules/settings/registry/create-settings-registry';
import { validateSettingValue } from '../modules/settings/settings-value';
import type { SettingDefinition, SettingValue } from '../modules/settings/settings.types';

/*
  Bulk setting writer for operators: applies a JSON object `{ "<key>": value }`
  read from stdin through the same validation, persistence and change log as
  `PUT /settings` (actor = null, i.e. "server"). All values are validated
  before anything is written; `--dry-run` only validates.

    docker exec -i <backend> node dist/src/cli/apply-settings.js \
      --reason "Paket 1.8 test AD" [--dry-run] < settings.json

  Running processes pick the values up within the settings snapshot TTL.
*/

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value.trim() : null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function planSettings(
  input: unknown,
  resolve: (key: string) => SettingDefinition,
): Array<{ definition: SettingDefinition; value: SettingValue }> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Input must be a JSON object { "<setting key>": value }');
  }
  const errors: string[] = [];
  const plan: Array<{ definition: SettingDefinition; value: SettingValue }> = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    try {
      const definition = resolve(key);
      plan.push({ definition, value: validateSettingValue(definition, value as SettingValue) });
    } catch (error) {
      errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Invalid settings, nothing written:\n  ${errors.join('\n  ')}`);
  }
  return plan;
}

async function main(): Promise<number> {
  const reason = readArgument('reason');
  const dryRun = process.argv.includes('--dry-run');
  if (!reason || reason.length < 3) {
    console.error('Usage: apply-settings --reason "<why>" [--dry-run] < settings.json');
    return 2;
  }
  const registry = createSettingsRegistry(applicationSettings);
  let plan: ReturnType<typeof planSettings>;
  try {
    plan = planSettings(JSON.parse(await readStdin()), (key) => registry.requireDefinition(key));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  for (const { definition } of plan) {
    console.log(`${dryRun ? '[dry-run] ' : ''}${definition.key}${definition.visibility === 'secret' ? ' (secret)' : ''}`);
  }
  if (dryRun) {
    console.log(`${plan.length} setting(s) valid; nothing written.`);
    return 0;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    for (const { definition, value } of plan) {
      await persistSettingValue(prisma as unknown as PrismaService, definition, value, {
        reason,
        actorUserId: null,
      });
    }
    console.log(`${plan.length} setting(s) written.`);
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
